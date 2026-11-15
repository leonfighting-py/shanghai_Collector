import test from "node:test";
import assert from "node:assert/strict";

import { AUDIENCE_LABELS, deriveAudience } from "../src/lib/audience.js";

test("高校讲座 → 学生", () => {
  assert.deepEqual(deriveAudience({ category: "高校讲座", title: "某某学术报告" }), ["学生"]);
});

test("标题或摘要里明确面向儿童 → 亲子", () => {
  assert.deepEqual(deriveAudience({ category: "线下活动", title: "亲子绘本工作坊" }), ["亲子"]);
  assert.deepEqual(deriveAudience({ category: "演出音乐", title: "儿童剧《小王子》" }), ["亲子"]);
  assert.deepEqual(deriveAudience({ category: "展览", title: "适合 3-12 岁的自然探索展" }), ["亲子"]);
  assert.deepEqual(deriveAudience({ category: "线下活动", title: "周末活动", summary: "少儿编程体验" }), ["亲子"]);
});

test("只写「儿童」不算：像「儿童艺术剧场」是场馆名，不是活动面向儿童", () => {
  assert.deepEqual(deriveAudience({ category: "演出音乐", title: "交响音乐会", summary: "地点：儿童艺术剧场" }), []);
});

test("行业信源 → 行业人士", () => {
  assert.deepEqual(deriveAudience({ category: "线下活动", title: "某技术沙龙", source_name: "GDG 上海" }), ["行业人士"]);
  assert.deepEqual(deriveAudience({ category: "线下活动", title: "某峰会", source_name: "钛媒体·活动" }), ["行业人士"]);
  assert.deepEqual(deriveAudience({ category: "展览", title: "某展会", source_name: "上海新国际博览中心·展会" }), [
    "行业人士",
  ]);
});

test("纯英文标题 → 英语友好", () => {
  assert.deepEqual(deriveAudience({ category: "演出音乐", title: "CHIIKAWA DAYS" }), ["英语友好"]);
  // 有汉字就不算，避免把中英混排的活动误标
  assert.deepEqual(deriveAudience({ category: "演出音乐", title: "CHIIKAWA DAYS 特展" }), []);
});

test("SmartShanghai 信源 → 英语友好", () => {
  assert.deepEqual(deriveAudience({ category: "线下活动", title: "某个活动", source_name: "SmartShanghai Events" }), [
    "英语友好",
  ]);
});

test("没有信号时返回空数组，不猜", () => {
  assert.deepEqual(deriveAudience({ category: "展览", title: "青铜器常设展" }), []);
  assert.deepEqual(deriveAudience({}), []);
});

test("多个标签按固定顺序返回", () => {
  const labels = deriveAudience({
    category: "高校讲座",
    title: "亲子阅读与学术写作 workshop",
    source_name: "GDG 上海",
  });
  assert.deepEqual(labels, ["亲子", "学生", "行业人士"]);
  // 顺序必须与 AUDIENCE_LABELS 一致，否则两个界面展示顺序会不一样
  assert.deepEqual(
    labels,
    AUDIENCE_LABELS.filter((label) => labels.includes(label)),
  );
});
