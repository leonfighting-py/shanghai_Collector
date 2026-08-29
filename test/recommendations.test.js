import test from "node:test";
import assert from "node:assert/strict";

import {
  getCategoryFeatures,
  getDisplayTopPicks,
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

test("display top picks prefer Chinese titles before English ones", () => {
  const mixed = [
    event("Jazz Night Live", "2026-05-22T20:00:00+08:00", "演出音乐", "Blue Note Shanghai"),
    event("周末爵士现场", "2026-05-22T19:00:00+08:00", "演出音乐", "育音堂"),
    event("Indie Showcase", "2026-05-23T21:00:00+08:00", "演出音乐", "MAO Livehouse"),
    event("独立乐队专场", "2026-05-23T20:00:00+08:00", "演出音乐", "育音堂"),
  ];
  const picks = getDisplayTopPicks(mixed, 3, "2026-05-22T12:00:00+08:00");

  assert.equal(picks.length, 3);
  assert.equal(picks[0].title, "周末爵士现场");
  assert.equal(picks[1].title, "独立乐队专场");
  assert.ok(/[\u3400-\u9FFF]/.test(picks[0].title));
  assert.ok(/[\u3400-\u9FFF]/.test(picks[1].title));
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

test("weekend/tonight classification is independent of runtime timezone", () => {
  // 2026-05-23 是上海周六；UTC 表示为 05-22T16:00Z 之后。若用 getDay()（UTC 周五）会漏判。
  const saturdayEveningShanghai = event("周六晚演出", "2026-05-23T19:00:00+08:00", "演出音乐", "上海音乐厅");
  // 2026-05-22 是上海周五
  const fridayNight = event("周五夜晚场", "2026-05-22T20:00:00+08:00", "演出音乐", "上海音乐厅");

  const weekend = getWeekendEvents([saturdayEveningShanghai, fridayNight]);
  assert.equal(weekend.length, 1);
  assert.equal(weekend[0].title, "周六晚演出");

  const tonight = getTonightEvents([saturdayEveningShanghai], "2026-05-23T10:00:00+08:00");
  assert.equal(tonight.length, 1);
  assert.equal(tonight[0].title, "周六晚演出");

  // 上海周六凌晨 1 点（= UTC 周五 17 点）：不算今晚（<18 点），但算周末
  const saturdayEarlyMorning = event("周六凌晨活动", "2026-05-23T01:00:00+08:00", "演出音乐", "上海音乐厅");
  assert.equal(getTonightEvents([saturdayEarlyMorning], "2026-05-22T20:00:00+08:00").length, 0);
  assert.equal(getWeekendEvents([saturdayEarlyMorning]).length, 1);
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
