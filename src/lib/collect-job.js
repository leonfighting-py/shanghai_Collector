import { collectEventsFromSources, LAND_SOURCES, SOURCE_SEEDS } from "./collector.js";
import { classifyRunStatus, countFailedSources } from "./collect-result.js";
import { filterEventCategories, getCategoryFilterConfig } from "./category-filter.js";
import { createDetailFetcher } from "./detail-fetch.js";
import { enrichEventsForPublish, getEventEnrichmentConfig } from "./event-enrichment.js";
import { backfillEventFacets } from "./facet-backfill.js";
import { backfillFacetsWithLlm, getFacetLlmConfig } from "./facet-llm.js";
import { backfillEventImages } from "./image-backfill.js";
import { loadOffshoreEvents } from "./offshore-events.js";
import { isRelevantPerformance } from "./parsers/shared.js";
import { resetLlmBudget, getLlmBudgetUsage } from "./siliconflow.js";
import {
  evaluatePublishGuard,
  filterOffsiteEvents,
  getOffsiteGuardConfig,
  getPublishGuardConfig,
  publishGuardFailure,
} from "./publish-guard.js";
import {
  finishCollectionRun,
  insertRawEvents,
  listEvents,
  publishEvents,
  readDetailCache,
  startCollectionRun,
  upsertSourceConfigs,
  writeDetailCache,
} from "./repository.js";

export function dedupeProvider() {
  // 去重仅由规则实现；此值写入 collection_runs.dedupe_provider 用于审计
  return "rules";
}

export function enrichmentProvider() {
  const config = getEventEnrichmentConfig();
  return config.enabled ? config.silicon.model : "disabled";
}

export function categoryFilterProvider() {
  const config = getCategoryFilterConfig();
  return config.enabled ? config.silicon.model : "disabled";
}

function countByCategory(events) {
  const counts = {};
  for (const event of events) counts[event.category] = (counts[event.category] || 0) + 1;
  return counts;
}

// 分类级下跌保护：单个分类采集量暴跌时保留旧数据，避免栏目因源临时挂掉而整段消失。
// 背景：发布是"全量替换窗口"，总量守门（publish-guard）无法识别单分类塌方——
// 当讲座源集体 403/超时但演出、展览正常时，总量仍达标，guard 放行，讲座被清空。
// 这里对每个分类单独比较，塌方分类用上次发布的旧数据顶替，正常分类走新数据。
const CATEGORY_DROP_RATIO = 0.5;
const CATEGORY_DROP_MIN_PREVIOUS = 5;

export function applyCategoryDropProtection(newEvents, previousEvents) {
  const protectedCategories = [];
  if (!Array.isArray(previousEvents) || previousEvents.length === 0) {
    return { events: newEvents, protectedCategories };
  }
  const prevCounts = countByCategory(previousEvents);
  const newCounts = countByCategory(newEvents);
  for (const [category, prev] of Object.entries(prevCounts)) {
    const next = newCounts[category] || 0;
    if (prev >= CATEGORY_DROP_MIN_PREVIOUS && next < Math.floor(prev * CATEGORY_DROP_RATIO)) {
      protectedCategories.push(category);
    }
  }
  if (protectedCategories.length === 0) return { events: newEvents, protectedCategories };
  const keepSet = new Set(protectedCategories);
  const kept = previousEvents.filter((event) => keepSet.has(event.category));
  const fresh = newEvents.filter((event) => !keepSet.has(event.category));
  return { events: [...fresh, ...kept], protectedCategories };
}

// 各阶段计时（WP0-C）：collect.yml 的 55 分钟上限要不要收紧，得先知道时间花在哪。
// Date.now() 差值就够（毫秒精度对分钟级决策足够），不引依赖。
// 计时键形如 "<name>_ms"；同名阶段多次调用会累加，总账不漏。
function createStageTimings() {
  const timings = {};
  async function timed(name, fn) {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      timings[`${name}_ms`] = (timings[`${name}_ms`] || 0) + (Date.now() - startedAt);
    }
  }
  return { timings, timed };
}

export async function runCollectJob() {
  resetLlmBudget();
  const { timings: stageTimings, timed } = createStageTimings();

  // 阶段：读旧数据（分类下跌保护和发布守门的比较基数都来自它）
  const previousEvents = await timed("list", () => listEvents());
  await timed("upsert_sources", () => upsertSourceConfigs(SOURCE_SEEDS));

  // 境外源（Eventbrite / 活动行 / AllEvents）在境内 runner 上是 403/405，
  // 由 offshore.yml 在境外出口采好后以 artifact 交过来；没配这个文件时整段不生效。
  // 读取 artifact 是本地文件操作，与网络抓取一起归入 fetch 阶段计时。
  const offshore = await timed("fetch", () => loadOffshoreEvents(process.env.OFFSHORE_EVENTS_FILE));
  if (offshore.status === "ok") {
    console.log(`[offshore] 合并境外源 ${offshore.events.length} 条（生成于 ${offshore.generatedAt}）`);
  } else if (offshore.status !== "disabled") {
    console.warn(`[offshore] 未合并：${offshore.reason}`);
  }

  const run = await startCollectionRun({ sourceCount: LAND_SOURCES.length });
  // 阶段：抓取解析
  const result = await timed("fetch", () =>
    collectEventsFromSources({ previousEvents, sources: LAND_SOURCES, extraEvents: offshore.events }),
  );

  // 回退到旧数据（本轮采集结果为空，用上一轮已发布数据顶住）——后续润色/补图/过滤全部跳过
  const fellBack = result.events === previousEvents;
  // 阶段：LLM 润色
  const enrichment = await timed("enrich", () =>
    fellBack
      ? { events: previousEvents, enrichedCount: 0, skippedCount: 0, failures: [] }
      : enrichEventsForPublish(result.events),
  );
  // 阶段：详情页共用抓取（图片回填与字段补齐走同一个 fetcher，同一地址一轮只请求一次）
  const facetLlmConfig = getFacetLlmConfig();
  // 只有开 LLM 兜底时才抽正文摘要：不给关掉的流程白传几百 KB 跨境
  const detailFetcher = createDetailFetcher({ includeExcerpt: facetLlmConfig.enabled });
  const detailUrls = fellBack
    ? []
    : [
        ...new Set(
          enrichment.events
            .map((event) => event.signup_url)
            .filter((url) => /^https?:\/\//i.test(String(url || ""))),
        ),
      ];
  const detailCache = fellBack
    ? { size: 0, failed: false }
    : await timed("detail_cache_read", async () => {
        try {
          const cached = await readDetailCache(detailUrls, { includeExcerpt: facetLlmConfig.enabled });
          detailFetcher.preload(cached);
          return { size: cached.size, failed: false };
        } catch (error) {
          // 缓存只是加速手段：读不到就当作没有缓存，本轮全部重抓一遍，
          // 不能让它在发布链路上把一个跑了十几分钟的采集整轮拖死。
          console.warn(`[detail-cache] 读取失败，本轮不命中缓存：${error.message}`);
          return { size: 0, failed: true };
        }
      });
  // 阶段：图片回填：对列表页没带图的事件抓详情页 og:image（失败静默，渐变兜底兜住）
  const imageBackfill = await timed("image_backfill", () =>
    fellBack
      ? { attempted: 0, backfilled: 0, failed: 0 }
      : backfillEventImages(enrichment.events, { fetcher: detailFetcher }),
  );
  // 阶段：分类过滤
  const categoryFilter = await timed("category_filter", () =>
    fellBack
      ? { events: enrichment.events, reclassifiedCount: 0, rejectedCount: 0, failures: [], enabled: false }
      : filterEventCategories(enrichment.events),
  );
  // 安全网：LLM 富集可能将英文体育标题翻译成中文（如 "Swim Championships" → "游泳锦标赛"），
  // 采集阶段的正则只覆盖原始标题；此处对富集后的最终标题再过滤一次。
  const publishableEvents =
    fellBack
      ? categoryFilter.events
      : categoryFilter.events.filter(
          (event) => event.category !== "演出音乐" || isRelevantPerformance(event),
        );
  // 阶段：字段补齐（第 1 层）。放在分类过滤之后、分类下跌保护之前：
  // 此时活动数已收敛，抓取量最小；被保护回退的旧数据也能带着字段进发布表。
  const facetBackfill = await timed("detail_facets", () =>
    fellBack
      ? { attempted: 0, fetched: 0, cacheHits: 0, failed: 0, robotsDenied: 0, address: 0, price: 0, is_free: 0, venue: 0 }
      : backfillEventFacets(publishableEvents, { fetcher: detailFetcher }),
  );
  // 本轮新抓到的详情页结果落库，下一轮直接命中缓存（有效期 7 天，见 DETAIL_CACHE_TTL_DAYS）。
  // 写失败只影响下一轮的抓取量，不影响本轮发布。
  const detailCacheWrite = await timed("detail_cache_write", async () => {
    if (fellBack) return { written: 0, failed: false };
    try {
      return { ...(await writeDetailCache(detailFetcher.drainPending())), failed: false };
    } catch (error) {
      console.warn(`[detail-cache] 写回失败，下一轮会重抓：${error.message}`);
      return { written: 0, failed: true };
    }
  });
  // 阶段：外地守门。本站只收录上海活动；默认 report 只记录，观察无误伤后改 drop。
  const offsiteConfig = getOffsiteGuardConfig();
  const offsite = fellBack
    ? { events: publishableEvents, mode: offsiteConfig.mode, dropped: [] }
    : filterOffsiteEvents(publishableEvents, offsiteConfig);
  // 阶段：第 3 层 LLM 兜底（默认关）。放在外地守门之后，免得为要丢弃的活动白花 token。
  // 只补区域 / 地址 / 人群；价格必须能在正文里找到原文才采信，不让模型算价。
  const facetLlm = await timed("detail_llm", () =>
    fellBack
      ? { enabled: false, asked: 0, filled: 0, rejected: 0, failures: [] }
      : backfillFacetsWithLlm(offsite.events, {
          config: facetLlmConfig,
          excerpts: detailFetcher.getExcerpts(),
        }),
  );
  // 分类级保护：某分类本次采集暴跌时，用上次发布的同分类旧数据顶替，避免栏目整段消失
  const dropProtection =
    fellBack
      ? { events: previousEvents, protectedCategories: [] }
      : applyCategoryDropProtection(offsite.events, previousEvents);  const protectedEvents = dropProtection.events;
  // 阶段：写原始表
  const rawResult = await timed("raw_insert", () =>
    insertRawEvents(result.rawEvents || result.events, { runId: run.id }),
  );

  // 发布守门：新数据量相对已发布数据暴跌时拒绝覆盖，保留旧数据
  const guardConfig = getPublishGuardConfig();
  const guard = !fellBack
    ? evaluatePublishGuard(previousEvents, protectedEvents, guardConfig)
    : { allowed: true, reason: null, previousCount: previousEvents.length, newCount: previousEvents.length };

  // 阶段：发布
  const publishResult = await timed("publish", () =>
    !fellBack && guard.allowed
      ? publishEvents(protectedEvents, {
          rawEventIds: rawResult.rawEventIds,
          dedupeProvider: dedupeProvider(),
        })
      : { inserted: previousEvents.length },
  );

  // 运行状态三档判定（WP0-D）：详见 collect-result.js 的 classifyRunStatus。
  // 失败信源数只统计 fetch 阶段的信源级失败（批次级失败没有 source，天然不进占比）。
  const failedSourceCount = countFailedSources(result.failures);
  const runStatus = classifyRunStatus({
    guardAllowed: guard.allowed,
    fellBackToOldData: fellBack,
    failedSourceCount,
    sourceCount: LAND_SOURCES.length,
  });

  const guardFailures = guard.allowed ? [] : [publishGuardFailure(guard)];

  await timed("finish_run", () =>
    finishCollectionRun(run.id, {
      status: runStatus,
      rawCount: result.collectedCount,
      publishedCount: publishResult.inserted,
      failures: [
        ...(result.failures || []),
        ...(enrichment.failures || []),
        ...(categoryFilter.failures || []),
        ...(facetLlm.failures || []),
        ...guardFailures,
        ...(offsite.dropped.length > 0
          ? [
              {
                source: "publish-guard",
                message: `外地活动 ${offsite.dropped.length} 条（${offsite.mode} 模式，${offsite.mode === "drop" ? "已剔除" : "未拦截"}）`,
              },
            ]
          : []),
      ],
      dedupeProvider: dedupeProvider(),
    }),
  );

  return {
    ...result,
    events: guard.allowed ? protectedEvents : previousEvents,
    run_status: runStatus,
    stage_timings: stageTimings,
    publish_guard: {
      allowed: guard.allowed,
      reason: guard.reason,
      previousCount: guard.previousCount,
      newCount: guard.newCount,
      ratio: guardConfig.ratio,
    },
    category_drop_protection: {
      protectedCategories: dropProtection.protectedCategories,
    },
    image_backfill: imageBackfill,
    facet_llm: {
      enabled: facetLlmConfig.enabled,
      asked: facetLlm.asked,
      filled: facetLlm.filled,
      rejected: facetLlm.rejected,
    },
    offsite_guard: {
      mode: offsite.mode,
      dropped: offsite.dropped.length,
      samples: offsite.dropped.slice(0, 5),
    },
    facet_backfill: facetBackfill,
    detail_cache: {
      read: detailCache.size,
      written: detailCacheWrite.written,
      failed: Boolean(detailCache.failed || detailCacheWrite.failed),
    },
    enrichment: {
      enabled: getEventEnrichmentConfig().enabled,
      provider: enrichmentProvider(),
      enrichedCount: enrichment.enrichedCount,
      skippedCount: enrichment.skippedCount,
      failures: enrichment.failures,
    },
    categoryFilter: {
      enabled: categoryFilter.enabled,
      provider: categoryFilterProvider(),
      reclassifiedCount: categoryFilter.reclassifiedCount,
      rejectedCount: categoryFilter.rejectedCount,
      failures: categoryFilter.failures,
    },
    run_id: run.id,
    raw_inserted: rawResult.inserted,
    published_inserted: publishResult.inserted,
    offshore: {
      status: offshore.status,
      count: offshore.events.length,
      generatedAt: offshore.generatedAt,
      reason: offshore.reason,
    },
    llm_budget: getLlmBudgetUsage(),
  };
}
