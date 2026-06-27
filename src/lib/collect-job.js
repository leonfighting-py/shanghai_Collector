import { collectEventsFromSources, SOURCE_SEEDS } from "./collector.js";
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
  if (process.env.LLM_DEDUPE_ENABLED !== "true") return "rules";
  return process.env.SILICONFLOW_MODEL || process.env.DEDUPER_MODEL || "llm";
}

export function enrichmentProvider() {
  const config = getEventEnrichmentConfig();
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
  const rawResult = await insertRawEvents(result.rawEvents || result.events, { runId: run.id });
  const publishResult =
    result.events !== previousEvents
      ? await publishEvents(enrichment.events, {
          rawEventIds: rawResult.rawEventIds,
          dedupeProvider: dedupeProvider(),
        })
      : { inserted: previousEvents.length };

  await finishCollectionRun(run.id, {
    status: result.ok ? "success" : "partial",
    rawCount: result.collectedCount,
    publishedCount: publishResult.inserted,
    failures: [...(result.failures || []), ...(enrichment.failures || [])],
    dedupeProvider: dedupeProvider(),
  });

  return {
    ...result,
    events: enrichment.events,
    enrichment: {
      enabled: getEventEnrichmentConfig().enabled,
      provider: enrichmentProvider(),
      enrichedCount: enrichment.enrichedCount,
      skippedCount: enrichment.skippedCount,
      failures: enrichment.failures,
    },
    run_id: run.id,
    raw_inserted: rawResult.inserted,
    published_inserted: publishResult.inserted,
  };
}
