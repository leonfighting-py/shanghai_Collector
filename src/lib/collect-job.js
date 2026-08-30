import { collectEventsFromSources, SOURCE_SEEDS } from "./collector.js";
import { filterEventCategories, getCategoryFilterConfig } from "./category-filter.js";
import { enrichEventsForPublish, getEventEnrichmentConfig } from "./event-enrichment.js";
import { backfillEventImages } from "./image-backfill.js";
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
  const rawResult = await insertRawEvents(result.rawEvents || result.events, { runId: run.id });

  // 发布守门：新数据量相对已发布数据暴跌时拒绝覆盖，保留旧数据
  const guardConfig = getPublishGuardConfig();
  const guard = result.events !== previousEvents
    ? evaluatePublishGuard(previousEvents, categoryFilter.events, guardConfig)
    : { allowed: true, reason: null, previousCount: previousEvents.length, newCount: previousEvents.length };

  const publishResult = result.events !== previousEvents && guard.allowed
      ? await publishEvents(categoryFilter.events, {
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
    events: guard.allowed ? categoryFilter.events : previousEvents,
    publish_guard: {
      allowed: guard.allowed,
      reason: guard.reason,
      previousCount: guard.previousCount,
      newCount: guard.newCount,
      ratio: guardConfig.ratio,
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
