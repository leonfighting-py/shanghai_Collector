import test from "node:test";
import assert from "node:assert/strict";

import { LONG_RUN_LEAD_DAYS, computeRemindAt, describeRemind } from "../src/lib/reminders.js";

// 2026-11-26 20:00 上海
const NOW = new Date("2026-11-26T20:00:00+08:00");

const single = (start) => ({
  title: "音乐会",
  start_time: start,
  end_time: null,
  category: "演出音乐",
  venue: "上海大剧院",
});

test("普通活动：开始前一天 10:00", () => {
  assert.equal(computeRemindAt(single("2026-12-05T19:30:00+08:00"), NOW), "2026-12-04T10:00:00+08:00");
  assert.equal(computeRemindAt(single("2026-11-28T14:00:00+08:00"), NOW), "2026-11-27T10:00:00+08:00");
});

test("长档期展览：闭展前 3 天 10:00", () => {
  const exhibition = {
    title: "特展",
    start_time: "2026-11-01T10:00:00+08:00",
    end_time: "2026-12-31T18:00:00+08:00",
    category: "展览",
    venue: "上海博物馆东馆",
  };
  // 跨度 61 天 ≥ 14，按闭展日 12-31 往前 3 天
  assert.equal(computeRemindAt(exhibition, NOW), `2026-12-28T10:00:00+08:00`);
  assert.equal(LONG_RUN_LEAD_DAYS, 3);
});

test("短展览按普通活动算（提前 1 天）", () => {
  const shortRun = {
    title: "七日展",
    start_time: "2026-12-10T10:00:00+08:00",
    end_time: "2026-12-16T18:00:00+08:00",
    category: "展览",
    venue: "某美术馆",
  };
  // 跨度 7 天 < 14
  assert.equal(computeRemindAt(shortRun, NOW), "2026-12-09T10:00:00+08:00");
});

test("提醒时刻已过就不排：一次性订阅只能发一条，排了也白发", () => {
  // 活动 11-27 开始 → 正常该在 11-26 10:00 提醒，但此刻已经 20:00
  assert.equal(computeRemindAt(single("2026-11-27T19:30:00+08:00"), NOW), null);
});

test("已经结束的活动不排", () => {
  const past = {
    title: "结束的展",
    start_time: "2026-11-01T10:00:00+08:00",
    end_time: "2026-11-20T18:00:00+08:00",
    category: "展览",
    venue: "某美术馆",
  };
  assert.equal(computeRemindAt(past, NOW), null);
});

test("缺开始时间返回 null，不抛错", () => {
  assert.equal(computeRemindAt({ title: "坏数据", venue: "x" }, NOW), null);
});

test("文案说清「只提醒一次」", () => {
  assert.match(describeRemind("2026-12-04T10:00:00+08:00"), /12 月 4 日上午 10:00 提醒你一次/);
  assert.equal(describeRemind(null), "这场活动已开始或已结束，不再提醒");
});
