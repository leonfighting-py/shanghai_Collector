import test from "node:test";
import assert from "node:assert/strict";

import { buildHomeViewModel } from "../src/lib/home-view-model.js";

const NOW = "2026-05-24T09:30:00+08:00";

const events = [
  event("爵士夜现场", "2026-05-25T20:00:00+08:00", "演出音乐", "Blue Note Shanghai"),
  event("独立乐队周末专场", "2026-05-30T21:00:00+08:00", "演出音乐", "育音堂"),
  event("城市咖啡生活节", "2026-05-24T11:00:00+08:00", "线下活动", "静安大悦城"),
  event("上海 AI 创业者线下交流", "2026-05-27T19:30:00+08:00", "AI聚会", "张江 AI 社区空间"),
  { ...event("当代摄影开放展", "2026-05-01T10:00:00+08:00", "展览", "Fotografiska Shanghai"), end_time: "2026-07-01T18:00:00+08:00" },
];

test("home view model labels the issue with the Shanghai two-week window", () => {
  const model = buildHomeViewModel(events, { now: NOW });

  assert.equal(model.today, "2026-05-24");
  assert.equal(model.windowDays, 14);
  assert.equal(model.issueLabel, "2026 · 05.24 — 06.06");
});

test("home view model counts upcoming, ongoing and venues", () => {
  const model = buildHomeViewModel(events, { now: NOW });

  assert.deepEqual(model.stats, { upcoming: 4, ongoing: 1, venues: 5 });
});

test("home view model highlights upcoming events with covers, one per category first", () => {
  const model = buildHomeViewModel(events, { now: NOW, highlightLimit: 3 });

  assert.equal(model.highlights.length, 3);
  assert.equal(new Set(model.highlights.map((item) => item.category)).size, 3);
  assert.ok(model.highlights.every((item) => item.image_url && item.start_time >= "2026-05-24"));
});

function event(title, start_time, category, venue) {
  return {
    title,
    start_time,
    venue,
    category,
    signup_url: "https://example.com",
    source_name: "Example",
    source_url: "https://example.com",
    image_url: "https://example.com/cover.jpg",
    dedupe_key: title,
    sources: [{ name: "Example", url: "https://example.com" }],
  };
}
