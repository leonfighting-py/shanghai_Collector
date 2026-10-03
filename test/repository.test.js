import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCleanupSql,
  buildEventWindowWhereSql,
  buildSchemaSql,
  filterEventsForWindow,
  normalizeSourceConfig,
} from "../src/lib/repository.js";
import { isInDateRange } from "../src/lib/events.js";

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

test("event window SQL keeps only activities that have not ended yet", () => {
  const where = buildEventWindowWhereSql("$1", "$2");

  assert.match(where, /start_time <= \$2/);
  assert.match(where, /coalesce\(end_time, start_time\)/);
  assert.match(where, /Asia\/Shanghai/);
  // 分类回看分支必须已经删干净：它会让已结束的活动继续出现在「未来两周」列表里
  assert.doesNotMatch(where, /category = '展览'/);
  assert.doesNotMatch(where, /category = '高校讲座'/);
  assert.doesNotMatch(where, /interval '60 days'/);
  assert.doesNotMatch(where, /interval '30 days'/);
});

// 回归护栏：replaceWeekEvents 先用读窗口 delete，再由发布口径决定回插。
// 两个口径一旦不一致，落在差集里的行会被删掉且永不再写回。
test("publish predicate matches the read window so long-running events are never dropped", () => {
  const startDate = "2026-06-19";
  const endDate = "2026-07-02";

  // 开口超过 60 天、但仍在展的长期展览 —— 旧实现会先删后不补
  const longExhibition = { ...event("长档期展", "2026-04-01T10:00:00+08:00", "展览") };
  longExhibition.end_time = "2027-11-13T18:00:00+08:00";
  assert.equal(isInDateRange(longExhibition, startDate, endDate), true);

  // 没有 end_time 的已过去活动：按 start 兜底，视为已结束，不进发布口径
  assert.equal(isInDateRange(event("过期刊座", "2026-06-02T10:00:00+08:00", "高校讲座"), startDate, endDate), false);

  // 有 end_time 但已经结束的长档期展览，同样不进发布口径（保留交给 cleanupOldData 的 7 天缓冲）
  const endedExhibition = { ...event("已结束的展", "2026-06-02T10:00:00+08:00", "展览") };
  endedExhibition.end_time = "2026-06-10T18:00:00+08:00";
  assert.equal(isInDateRange(endedExhibition, startDate, endDate), false);

  // 窗口内的活动照常进入
  assert.equal(isInDateRange(event("周末活动", "2026-06-20T10:00:00+08:00", "线下活动"), startDate, endDate), true);
});

test("local event filtering drops activities that already ended", () => {
  const events = [
    event("已结束线下活动", "2026-06-02T10:00:00+08:00", "线下活动"),
    event("周末活动", "2026-06-20T10:00:00+08:00", "线下活动"),
  ];

  const filtered = filterEventsForWindow(events, {
    startDate: "2026-06-19",
    endDate: "2026-07-02",
  });

  assert.deepEqual(
    filtered.map((item) => item.title),
    ["周末活动"],
  );
});

test("local event filtering keeps un-ended exhibitions across the window", () => {
  const ongoing = { ...event("常设展", "2026-06-02T10:00:00+08:00", "展览") };
  ongoing.end_time = "2026-09-30T18:00:00+08:00";
  const events = [ongoing, event("周末活动", "2026-06-20T10:00:00+08:00", "线下活动")];

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
