import test from "node:test";
import assert from "node:assert/strict";

import {
  SCENE_MIN_COUNT,
  availableScenes,
  matchesScene,
  sceneCounts,
  weekendDates,
} from "../src/lib/scenes.js";

// 2026-11-22 是周日
const SUNDAY = new Date("2026-11-22T12:44:00+08:00");
const MONDAY = new Date("2026-11-23T09:00:00+08:00");
const SATURDAY = new Date("2026-11-28T10:00:00+08:00");

const event = (overrides = {}) => ({
  title: "测试活动",
  start_time: "2026-11-22T19:30:00+08:00",
  category: "演出音乐",
  venue: "上海大剧院",
  is_free: null,
  audience: [],
  indoor: null,
  inDictionary: null,
  ...overrides,
});

test("今晚：上海今天 18:00 之后开始才算", () => {
  assert.equal(matchesScene(event({ start_time: "2026-11-22T19:30:00+08:00" }), "tonight", SUNDAY), true);
  assert.equal(matchesScene(event({ start_time: "2026-11-22T18:00:00+08:00" }), "tonight", SUNDAY), true);
  assert.equal(matchesScene(event({ start_time: "2026-11-22T15:00:00+08:00" }), "tonight", SUNDAY), false);
  assert.equal(matchesScene(event({ start_time: "2026-11-23T19:30:00+08:00" }), "tonight", SUNDAY), false);
});

test("今晚：按上海时区判断，UTC 写法不能算错", () => {
  // 11:30Z = 上海 19:30，属于今晚
  assert.equal(matchesScene(event({ start_time: "2026-11-22T11:30:00Z" }), "tonight", SUNDAY), true);
  // 09:00Z = 上海 17:00，不算今晚
  assert.equal(matchesScene(event({ start_time: "2026-11-22T09:00:00Z" }), "tonight", SUNDAY), false);
});

test("正在进行的长展不算「今晚」：它天天都在", () => {
  const exhibition = event({
    category: "展览",
    start_time: "2026-10-01T10:00:00+08:00",
    end_time: "2026-12-31T18:00:00+08:00",
  });
  assert.equal(matchesScene(exhibition, "tonight", SUNDAY), false);
});

test("这个周末：周日只算今天", () => {
  assert.deepEqual(weekendDates(SUNDAY), ["2026-11-22"]);
  assert.equal(matchesScene(event({ start_time: "2026-11-22T14:00:00+08:00" }), "weekend", SUNDAY), true);
  assert.equal(matchesScene(event({ start_time: "2026-11-21T14:00:00+08:00" }), "weekend", SUNDAY), false);
});

test("这个周末：工作日指向本周六日，周六算两天", () => {
  assert.deepEqual(weekendDates(MONDAY), ["2026-11-28", "2026-11-29"]);
  assert.deepEqual(weekendDates(SATURDAY), ["2026-11-28", "2026-11-29"]);

  assert.equal(matchesScene(event({ start_time: "2026-11-28T10:00:00+08:00" }), "weekend", MONDAY), true);
  assert.equal(matchesScene(event({ start_time: "2026-11-29T10:00:00+08:00" }), "weekend", MONDAY), true);
  assert.equal(matchesScene(event({ start_time: "2026-11-27T10:00:00+08:00" }), "weekend", MONDAY), false);
});

test("免费：只有明确 true 才算，null 表示不知道不是免费", () => {
  assert.equal(matchesScene(event({ is_free: true }), "free", SUNDAY), true);
  assert.equal(matchesScene(event({ is_free: false }), "free", SUNDAY), false);
  assert.equal(matchesScene(event({ is_free: null }), "free", SUNDAY), false);
});

test("雨天室内：字典说室内就算；展览在场馆字典里也算", () => {
  assert.equal(matchesScene(event({ indoor: true }), "indoor", SUNDAY), true);
  assert.equal(matchesScene(event({ category: "展览", indoor: true, inDictionary: true }), "indoor", SUNDAY), true);
  // 展览但场馆不在字典里 → 不知道是不是室内，不猜
  assert.equal(matchesScene(event({ category: "展览", indoor: null, inDictionary: false }), "indoor", SUNDAY), false);
  // 演出在字典里但场地是户外的（如世博文化公园）
  assert.equal(matchesScene(event({ indoor: false, inDictionary: true }), "indoor", SUNDAY), false);
});

test("带娃：人群标签含亲子", () => {
  assert.equal(matchesScene(event({ audience: ["亲子"] }), "kids", SUNDAY), true);
  assert.equal(matchesScene(event({ audience: ["亲子", "学生"] }), "kids", SUNDAY), true);
  assert.equal(matchesScene(event({ audience: ["学生"] }), "kids", SUNDAY), false);
  assert.equal(matchesScene(event({ audience: [] }), "kids", SUNDAY), false);
});

test("不传场景时全部通过", () => {
  assert.equal(matchesScene(event(), "", SUNDAY), true);
  assert.equal(matchesScene(event(), "不存在的场景", SUNDAY), true);
});

test("少于 3 条的场景不进入卡片列表", () => {
  const events = [
    event({ is_free: true }),
    event({ is_free: true }),
    event({ is_free: true }),
    event({ is_free: false }),
    event({ audience: ["亲子"] }),
  ];

  const available = availableScenes(events, SUNDAY);
  assert.equal(available.find((scene) => scene.key === "free")?.count, 3, "免费 3 条应展示");
  assert.equal(available.find((scene) => scene.key === "kids"), undefined, "带娃 1 条应隐藏");

  const counts = sceneCounts(events, SUNDAY);
  assert.equal(counts.find((scene) => scene.key === "kids")?.count, 1, "计数仍然给出，便于调试");
  assert.equal(SCENE_MIN_COUNT, 3);
});
