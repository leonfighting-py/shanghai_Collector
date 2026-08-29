import { collectEventsFromSources, SOURCE_SEEDS } from "./collector.js";
import { filterEventCategories, getCategoryFilterConfig } from "./category-filter.js";
import { enrichEventsForPublish, getEventEnrichmentConfig } from "./event-enrichment.js";
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
  const categoryFilter =
    result.events === previousEvents
      ? { events: enrichment.events, reclassifiedCount: 0, rejectedCount: 0, failures: [], enabled: false }
      : await filterEventCategories(enrichment.events);
  const rawResult = await insertRawEvents(result.rawEvents || result.events, { runId: run.id });
  const publishResult =
    result.events !== previousEvents
      ? await publishEvents(categoryFilter.events, {
          rawEventIds: rawResult.rawEventIds,
          dedupeProvider: dedupeProvider(),
        })
      : { inserted: previousEvents.length };

  await finishCollectionRun(run.id, {
    status: result.ok ? "success" : "partial",
    rawCount: result.collectedCount,
    publishedCount: publishResult.inserted,
    failures: [
      ...(result.failures || []),
      ...(enrichment.failures || []),
      ...(categoryFilter.failures || []),
    ],
    dedupeProvider: dedupeProvider(),
  });

  return {
    ...result,
    events: categoryFilter.events,
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
