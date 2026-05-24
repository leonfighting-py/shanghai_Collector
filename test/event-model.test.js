import test from "node:test";
import assert from "node:assert/strict";

import {
  CATEGORIES,
  buildDedupeKey,
  filterPublishableEvents,
  mergeDuplicateEvents,
  toShanghaiWeekRange,
} from "../src/lib/events.js";

test("keeps the homepage categories stable", () => {
  assert.deepEqual(CATEGORIES, ["演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"]);
});

test("filters records missing required publishing fields", () => {
  const valid = {
    title: "周五爵士现场",
    start_time: "2026-05-22T20:00:00+08:00",
    venue: "Blue Note Shanghai",
    category: "演出音乐",
    signup_url: "https://example.com/jazz",
    source_name: "Example",
    source_url: "https://example.com",
  };

  const events = filterPublishableEvents([
    valid,
    { ...valid, title: "" },
    { ...valid, start_time: "" },
    { ...valid, signup_url: "" },
    { ...valid, category: "其他" },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].dedupe_key, buildDedupeKey(valid));
});

test("dedupe key normalizes title, event date, and venue", () => {
  const left = buildDedupeKey({
    title: "  2026 上海 春浪 音乐节！",
    start_time: "2026-05-23T18:00:00+08:00",
    venue: " 上海世博文化公园 ",
  });
  const right = buildDedupeKey({
    title: "2026上海春浪音乐节",
    start_time: "2026-05-23T20:00:00+08:00",
    venue: "上海世博文化公园",
  });

  assert.equal(left, right);
});

test("merges duplicate events and preserves multiple sources", () => {
  const events = filterPublishableEvents([
    {
      title: "上海春浪音乐节",
      start_time: "2026-05-23T18:00:00+08:00",
      venue: "上海世博文化公园",
      category: "演出音乐",
      signup_url: "https://source-a.example/event",
      source_name: "Source A",
      source_url: "https://source-a.example/event",
    },
    {
      title: " 上海春浪音乐节 ",
      start_time: "2026-05-23T19:00:00+08:00",
      venue: "上海世博文化公园",
      category: "演出音乐",
      signup_url: "https://source-b.example/event",
      source_name: "Source B",
      source_url: "https://source-b.example/event",
    },
  ]);

  const merged = mergeDuplicateEvents(events);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 2);
  assert.deepEqual(
    merged[0].sources.map((source) => source.name),
    ["Source A", "Source B"],
  );
});

test("computes a Monday to Sunday Shanghai week range", () => {
  const range = toShanghaiWeekRange("2026-05-22");

  assert.equal(range.startDate, "2026-05-18");
  assert.equal(range.endDate, "2026-05-24");
});
