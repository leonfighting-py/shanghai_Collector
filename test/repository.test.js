import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCleanupSql,
  buildEventWindowWhereSql,
  buildSchemaSql,
  filterEventsForWindow,
  normalizeSourceConfig,
} from "../src/lib/repository.js";

test("schema includes source configs, raw events, collection runs, and published events", () => {
  const schema = buildSchemaSql();

  assert.match(schema, /create table if not exists source_configs/);
  assert.match(schema, /create table if not exists collection_runs/);
  assert.match(schema, /create table if not exists raw_events/);
  assert.match(schema, /create table if not exists events/);
  assert.match(schema, /raw_event_ids jsonb/);
  assert.match(schema, /dedupe_provider text/);
});

test("cleanup SQL deletes old event data without removing source configs", () => {
  const cleanup = buildCleanupSql({ eventRetentionDays: 60, runRetentionDays: 90 });

  assert.deepEqual(
    cleanup.statements.map((statement) => statement.params),
    [[60], [60], [90]],
  );
  assert.match(cleanup.statements[0].sql, /delete from raw_events/);
  assert.match(cleanup.statements[1].sql, /delete from events/);
  assert.match(cleanup.statements[2].sql, /delete from collection_runs/);
  assert.ok(cleanup.statements.every((statement) => !statement.sql.includes(";")));
  assert.ok(cleanup.statements.every((statement) => !/delete from source_configs/.test(statement.sql)));
});

test("source configs persist parser metadata without functions", () => {
  const config = normalizeSourceConfig({
    name: "猫眼演出",
    url: "https://show.maoyan.com/",
    category: "演出音乐",
    parser: () => [],
  });

  assert.equal(config.source_name, "猫眼演出");
  assert.equal(config.base_url, "https://show.maoyan.com/");
  assert.equal(config.parser_type, "custom");
  assert.equal(config.enabled, true);
  assert.equal(config.notes, "");
});

test("event window SQL includes recent ongoing exhibitions", () => {
  const where = buildEventWindowWhereSql("$1", "$2");

  assert.match(where, /category = '展览'/);
  assert.match(where, /interval '60 days'/);
});

test("local event filtering includes recent ongoing exhibitions", () => {
  const events = [
    event("常设展", "2026-06-02T10:00:00+08:00", "展览"),
    event("旧讲座", "2026-06-02T10:00:00+08:00", "高校讲座"),
    event("周末活动", "2026-06-20T10:00:00+08:00", "线下活动"),
  ];

  const filtered = filterEventsForWindow(events, {
    startDate: "2026-06-19",
    endDate: "2026-07-02",
  });

  assert.deepEqual(
    filtered.map((item) => item.title),
    ["常设展", "周末活动"],
  );
});

function event(title, start_time, category) {
  return {
    title,
    start_time,
    venue: "上海",
    category,
    signup_url: "https://example.com",
    source_name: "Example",
    source_url: "https://example.com",
    dedupe_key: title,
  };
}
