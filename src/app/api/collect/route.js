import { NextResponse } from "next/server";

import { collectEventsFromSources, SOURCE_SEEDS } from "../../../lib/collector.js";
import {
  finishCollectionRun,
  insertRawEvents,
  listEvents,
  publishEvents,
  startCollectionRun,
  upsertSourceConfigs,
} from "../../../lib/repository.js";

export async function POST(request) {
  const expected = process.env.COLLECT_SECRET;
  const provided = request.headers.get("x-collect-secret") || new URL(request.url).searchParams.get("secret");

  if (expected && provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const previousEvents = await listEvents();
  await upsertSourceConfigs(SOURCE_SEEDS);
  const run = await startCollectionRun({ sourceCount: SOURCE_SEEDS.length });
  const result = await collectEventsFromSources({ previousEvents });
  const rawResult = await insertRawEvents(result.rawEvents || result.events, { runId: run.id });
  const publishResult =
    result.events !== previousEvents
      ? await publishEvents(result.events, {
          rawEventIds: rawResult.rawEventIds,
          dedupeProvider: process.env.LLM_DEDUPE_ENABLED === "true" ? process.env.DEDUPER_MODEL || "llm" : "rules",
        })
      : { inserted: previousEvents.length };

  await finishCollectionRun(run.id, {
    status: result.ok ? "success" : "partial",
    rawCount: result.collectedCount,
    publishedCount: publishResult.inserted,
    failures: result.failures,
    dedupeProvider: process.env.LLM_DEDUPE_ENABLED === "true" ? process.env.DEDUPER_MODEL || "llm" : "rules",
  });

  return NextResponse.json({ ...result, run_id: run.id, raw_inserted: rawResult.inserted }, { status: result.ok ? 200 : 207 });
}
