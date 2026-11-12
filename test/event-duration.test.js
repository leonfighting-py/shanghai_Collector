import test from "node:test";
import assert from "node:assert/strict";

import { LONG_RUNNING_DAYS, inferEventEndTime, isLongRunningEvent } from "../src/lib/event-duration.js";

test("展览默认按长期活动补齐约 3 个月", () => {
  const event = { title: "印象派大展", category: "展览", start_time: "2026-10-03T10:00:00+08:00", end_time: null };
  assert.equal(isLongRunningEvent(event), true);
  assert.equal(inferEventEndTime(event), "2027-01-01T10:00:00+08:00");
});

test("单场音乐会绝不编造结束时间", () => {
  for (const title of [
    "伊丽莎白·莱昂斯卡娅钢琴独奏音乐会",
    "宁峰与波茨坦室内乐团莫扎特协奏曲",
    "维也纳之声金秋交响音乐会",
  ]) {
    const event = { title, category: "演出音乐", start_time: "2026-10-06T19:30:00+08:00", end_time: null };
    assert.equal(isLongRunningEvent(event), false, title);
    assert.equal(inferEventEndTime(event), null, title);
  }
});

test("单场信号优先于长期信号（音乐会版音乐剧仍按单场）", () => {
  const event = {
    title: "音乐剧《猫》主题音乐会",
    category: "演出音乐",
    start_time: "2026-10-06T19:30:00+08:00",
    end_time: null,
  };
  assert.equal(isLongRunningEvent(event), false);
  assert.equal(inferEventEndTime(event), null);
});

test("驻场 / 剧场长档期演出按长期活动补齐", () => {
  for (const title of ["音乐剧《时光代理人》上海演出", "SNH48星梦剧院公演", "360°环绕剧场喜剧《成仙》上海"]) {
    const event = { title, category: "演出音乐", start_time: "2026-10-03T19:30:00+08:00", end_time: null };
    assert.equal(isLongRunningEvent(event), true, title);
    assert.equal(inferEventEndTime(event), "2027-01-01T19:30:00+08:00", title);
  }
});

test("讲座 / 研讨 / 路演类线下活动保持 end_time 为 null", () => {
  for (const [title, category] of [
    ["讲座：秦崩楚亡汉兴", "线下活动"],
    ["上海AI实验室科学智能研讨会", "AI聚会"],
    ["复旦2027考研855考试大纲发布", "高校讲座"],
  ]) {
    const event = { title, category, start_time: "2026-10-08T14:00:00+08:00", end_time: null };
    assert.equal(inferEventEndTime(event), null, title);
  }
});

test("源已给出且晚于开始的结束时间，一手数据优先，不被覆盖", () => {
  const event = {
    title: "印象派大展",
    category: "展览",
    start_time: "2026-10-03T10:00:00+08:00",
    end_time: "2026-11-13T18:00:00+08:00",
  };
  assert.equal(inferEventEndTime(event), "2026-11-13T18:00:00+08:00");
});

test("结束时间早于起始时间（脏数据）时按长期活动重建", () => {
  const event = {
    title: "印象派大展",
    category: "展览",
    start_time: "2026-10-03T10:00:00+08:00",
    end_time: "2026-10-01T10:00:00+08:00",
  };
  assert.equal(inferEventEndTime(event), "2027-01-01T10:00:00+08:00");
});

test("结束时间早于起始时间的单场活动，回落为 null 而不是留脏值", () => {
  const event = {
    title: "钢琴独奏音乐会",
    category: "演出音乐",
    start_time: "2026-10-06T19:30:00+08:00",
    end_time: "2026-10-05T19:30:00+08:00",
  };
  assert.equal(inferEventEndTime(event), null);
});

test("缺 start_time 或缺标题时不炸，原样返回", () => {
  assert.equal(inferEventEndTime({ title: "x", start_time: null, end_time: null }), null);
  assert.equal(inferEventEndTime({ title: "x", category: "展览", start_time: "bad-date", end_time: null }), null);
  assert.equal(inferEventEndTime(undefined), null);
});

test("可配置补齐天数，默认 90 天", () => {
  assert.equal(LONG_RUNNING_DAYS, 90);
  const event = { title: "印象派大展", category: "展览", start_time: "2026-10-03T10:00:00+08:00", end_time: null };
  assert.equal(inferEventEndTime(event, { longRunningDays: 30 }), "2026-11-02T10:00:00+08:00");
});
