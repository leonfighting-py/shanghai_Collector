import test from "node:test";
import assert from "node:assert/strict";

import {
  getCategoryFeatures,
  getHeroEvent,
  getTonightEvents,
  getTopPicks,
  getWeekendEvents,
} from "../src/lib/recommendations.js";

const events = [
  event("音乐节开幕现场", "2026-05-22T20:00:00+08:00", "演出音乐", "上海音乐厅"),
  event("当代艺术开幕展", "2026-05-23T10:00:00+08:00", "展览", "外滩美术馆"),
  event("周末咖啡生活节", "2026-05-24T11:00:00+08:00", "线下活动", "上海"),
  event("AI 城市公开讲座", "2026-05-21T19:00:00+08:00", "高校讲座", "NYU Shanghai"),
  event("上海 AI 创业者线下交流", "2026-05-23T19:30:00+08:00", "AI聚会", "张江 AI 社区空间"),
  event("普通活动", "2026-05-20T11:00:00+08:00", "线下活动", "上海"),
];

test("selects a visually strong hero event from scored recommendations", () => {
  assert.equal(getHeroEvent(events).title, "音乐节开幕现场");
});

test("top picks are limited and sorted by recommendation score", () => {
  const picks = getTopPicks(events, 3);

  assert.equal(picks.length, 3);
  assert.equal(picks[0].title, "音乐节开幕现场");
});

test("category features return one recommendation per category", () => {
  const features = getCategoryFeatures(events);

  assert.deepEqual(Object.keys(features), ["演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"]);
  assert.equal(features["展览"].title, "当代艺术开幕展");
  assert.equal(features["AI聚会"].title, "上海 AI 创业者线下交流");
});

test("tonight and weekend shelves use Shanghai local dates", () => {
  assert.equal(getTonightEvents(events, "2026-05-22T12:00:00+08:00")[0].title, "音乐节开幕现场");
  assert.equal(getWeekendEvents(events).length, 3);
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
    sources: [
      { name: "Example", url: "https://example.com" },
      { name: "Official", url: "https://example.com/official" },
    ],
  };
}
