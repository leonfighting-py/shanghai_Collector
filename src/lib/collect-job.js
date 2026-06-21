import { collectEventsFromSources, SOURCE_SEEDS } from "./collector.js";
import {
  finishCollectionRun,
  insertRawEvents,
  listEvents,
  publishEvents,
  startCollectionRun,
  upsertSourceConfigs,
} from "./repository.js";

export function dedupeProvider() {
  return process.env.LLM_DEDUPE_ENABLED === "true" ? process.env.DEDUPER_MODEL || "llm" : "rules";
}

export async function runCollectJob() {
  const previousEvents = await listEvents();
  await upsertSourceConfigs(SOURCE_SEEDS);
  const run = await startCollectionRun({ sourceCount: SOURCE_SEEDS.length });
  const result = await collectEventsFromSources({ previousEvents });
  const rawResult = await insertRawEvents(result.rawEvents || result.events, { runId: run.id });
  const publishResult =
    result.events !== previousEvents
      ? await publishEvents(result.events, {
          rawEventIds: rawResult.rawEventIds,
          dedupeProvider: dedupeProvider(),
        })
      : { inserted: previousEvents.length };

  await finishCollectionRun(run.id, {
    status: result.ok ? "success" : "partial",
    rawCount: result.collectedCount,
    publishedCount: publishResult.inserted,
    failures: result.failures,
    dedupeProvider: dedupeProvider(),
  });

  return {
    ...result,
    run_id: run.id,
    raw_inserted: rawResult.inserted,
    published_inserted: publishResult.inserted,
  };
}
