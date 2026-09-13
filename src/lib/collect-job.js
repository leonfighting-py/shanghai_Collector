import { collectEventsFromSources, SOURCE_SEEDS } from "./collector.js";
import { filterEventCategories, getCategoryFilterConfig } from "./category-filter.js";
import { enrichEventsForPublish, getEventEnrichmentConfig } from "./event-enrichment.js";
import { backfillEventImages } from "./image-backfill.js";
import { isRelevantPerformance } from "./parsers/shared.js";
import {
  evaluatePublishGuard,
  getPublishGuardConfig,
  publishGuardFailure,
} from "./publish-guard.js";
import {
  finishCollectionRun,
  insertRawEvents,
  listEvents,
  publishEvents,
  startCollectionRun,
  upsertSourceConfigs,
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

export async function runCollectJob() {
  const previousEvents = await listEvents();
  await upsertSourceConfigs(SOURCE_SEEDS);
  const run = await startCollectionRun({ sourceCount: SOURCE_SEEDS.length });
  const result = await collectEventsFromSources({ previousEvents });
  const enrichment =
    result.events === previousEvents
      ? { events: previousEvents, enrichedCount: 0, skippedCount: 0, failures: [] }
      : await enrichEventsForPublish(result.events);
  // 图片回填：对列表页没带图的事件抓详情页 og:image（失败静默，渐变兜底兜住）
  const imageBackfill =
    result.events === previousEvents
      ? { attempted: 0, backfilled: 0, failed: 0 }
      : await backfillEventImages(enrichment.events);
  const categoryFilter =
    result.events === previousEvents
      ? { events: enrichment.events, reclassifiedCount: 0, rejectedCount: 0, failures: [], enabled: false }
      : await filterEventCategories(enrichment.events);
  // 安全网：LLM 富集可能将英文体育标题翻译成中文（如 "Swim Championships" → "游泳锦标赛"），
  // 采集阶段的正则只覆盖原始标题；此处对富集后的最终标题再过滤一次。
  const publishableEvents =
    result.events === previousEvents
      ? categoryFilter.events
      : categoryFilter.events.filter(
          (event) => event.category !== "演出音乐" || isRelevantPerformance(event),
        );
  // 分类级保护：某分类本次采集暴跌时，用上次发布的同分类旧数据顶替，避免栏目整段消失
  const dropProtection =
    result.events === previousEvents
      ? { events: previousEvents, protectedCategories: [] }
      : applyCategoryDropProtection(publishableEvents, previousEvents);
  const protectedEvents = dropProtection.events;
  const rawResult = await insertRawEvents(result.rawEvents || result.events, { runId: run.id });

  // 发布守门：新数据量相对已发布数据暴跌时拒绝覆盖，保留旧数据
  const guardConfig = getPublishGuardConfig();
  const guard = result.events !== previousEvents
    ? evaluatePublishGuard(previousEvents, protectedEvents, guardConfig)
    : { allowed: true, reason: null, previousCount: previousEvents.length, newCount: previousEvents.length };

  const publishResult = result.events !== previousEvents && guard.allowed
      ? await publishEvents(protectedEvents, {
          rawEventIds: rawResult.rawEventIds,
          dedupeProvider: dedupeProvider(),
        })
      : { inserted: previousEvents.length };

  const guardFailures = guard.allowed ? [] : [publishGuardFailure(guard)];

  await finishCollectionRun(run.id, {
    status: result.ok && guard.allowed ? "success" : "partial",
    rawCount: result.collectedCount,
    publishedCount: publishResult.inserted,
    failures: [
      ...(result.failures || []),
      ...(enrichment.failures || []),
      ...(categoryFilter.failures || []),
      ...guardFailures,
    ],
    dedupeProvider: dedupeProvider(),
  });

  return {
    ...result,
    events: guard.allowed ? protectedEvents : previousEvents,
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
  };
}
