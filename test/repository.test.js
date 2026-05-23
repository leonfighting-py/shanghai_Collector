import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCleanupSql,
  buildSchemaSql,
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

  assert.match(cleanup.sql, /delete from raw_events/);
  assert.match(cleanup.sql, /delete from events/);
  assert.match(cleanup.sql, /delete from collection_runs/);
  assert.doesNotMatch(cleanup.sql, /delete from source_configs/);
  assert.deepEqual(cleanup.params, [60, 60, 90]);
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
