import test from "node:test";
import assert from "node:assert/strict";

import { buildHomeViewModel } from "../src/lib/home-view-model.js";

const events = [
  event("爵士夜现场", "2026-05-22T20:00:00+08:00", "演出音乐", "Blue Note Shanghai"),
  event("独立乐队周末专场", "2026-05-23T21:00:00+08:00", "演出音乐", "育音堂"),
  event("当代摄影开放展", "2026-05-24T10:00:00+08:00", "展览", "Fotografiska Shanghai"),
  event("城市咖啡生活节", "2026-05-24T11:00:00+08:00", "线下活动", "静安大悦城"),
  event("AI 与城市研究公开讲座", "2026-05-21T19:00:00+08:00", "高校讲座", "NYU Shanghai"),
  event("上海 AI 创业者线下交流", "2026-05-23T19:30:00+08:00", "AI聚会", "张江 AI 社区空间"),
];

test("home view model uses a dynamic Shanghai daily update date", () => {
  const model = buildHomeViewModel(events, { now: "2026-05-24T09:30:00+08:00" });

  assert.equal(model.updatedDate, "05/24");
  assert.equal(model.updatedLabel, "Daily Update");
});

test("home view model selects multiple featured events for the rolling banner", () => {
  const model = buildHomeViewModel(events, { now: "2026-05-24T09:30:00+08:00", featuredLimit: 3 });

  assert.equal(model.featuredEvents.length, 3);
  assert.ok(model.featuredEvents.every((item) => item.category && item.title && item.signup_url));
});

test("home view model groups events into category sections", () => {
  const model = buildHomeViewModel(events, { now: "2026-05-24T09:30:00+08:00" });

  assert.deepEqual(
    model.categorySections.map((section) => section.title),
    ["演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"],
  );
  assert.equal(model.categorySections[0].events.length, 2);
  assert.equal(model.categorySections[1].events[0].title, "当代摄影开放展");
  assert.equal(model.categorySections[4].eyebrow, "AI Meetups");
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
    dedupe_key: title,
    sources: [{ name: "Example", url: "https://example.com" }],
  };
}
