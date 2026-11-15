import test from "node:test";
import assert from "node:assert/strict";

import { detectOffsite, filterOffsiteEvents, getOffsiteGuardConfig } from "../src/lib/publish-guard.js";

const shanghai = (overrides = {}) => ({
  title: "青铜器常设展",
  category: "展览",
  venue: "上海博物馆东馆",
  address: "上海市浦东新区世纪大道1952号",
  ...overrides,
});

test("上海路名里的外地城市名不算外地（北京西路 / 南京西路）", () => {
  assert.equal(detectOffsite(shanghai({ address: "上海市静安区北京西路510号" })), null);
  assert.equal(detectOffsite(shanghai({ address: "上海市黄浦区南京西路325号" })), null);
  assert.equal(detectOffsite(shanghai({ venue: "南京东路步行街", address: "" })), null);
});

test("地址明确写其他城市 → 外地", () => {
  const hit = detectOffsite(shanghai({ venue: "吴文化博物馆", address: "苏州市吴中区宝带东路399号" }));
  assert.equal(hit.city, "苏州");
  assert.equal(hit.confident, true);
});

test("不含「上海市」字样、只写城市的也算，但标记为不确定", () => {
  const hit = detectOffsite(shanghai({ venue: "苏州博物馆西馆", address: "" }));
  assert.equal(hit.city, "苏州");
  assert.equal(hit.confident, false);
});

test("场馆和地址都空时不判外地", () => {
  assert.equal(detectOffsite(shanghai({ venue: "", address: "" })), null);
});

test("report 模式：只记录不剔除（默认）", () => {
  const events = [shanghai(), shanghai({ title: "苏州的展", venue: "吴文化博物馆", address: "苏州市吴中区宝带东路399号" })];
  const result = filterOffsiteEvents(events, { mode: "report" });

  assert.equal(result.events.length, 2, "report 模式下事件必须全部保留");
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].city, "苏州");
  assert.equal(result.dropped[0].title, "苏州的展");
});

test("drop 模式：真正剔除", () => {
  const events = [shanghai(), shanghai({ title: "苏州的展", venue: "吴文化博物馆", address: "苏州市吴中区宝带东路399号" })];
  const result = filterOffsiteEvents(events, { mode: "drop" });

  assert.equal(result.events.length, 1);
  assert.equal(result.dropped.length, 1);
});

test("模式从环境变量读，写错值一律退回 report（宁可少拦，不可错删）", () => {
  assert.equal(getOffsiteGuardConfig({}).mode, "report");
  assert.equal(getOffsiteGuardConfig({ OFFSITE_GUARD_MODE: "drop" }).mode, "drop");
  assert.equal(getOffsiteGuardConfig({ OFFSITE_GUARD_MODE: "DROP" }).mode, "drop");
  assert.equal(getOffsiteGuardConfig({ OFFSITE_GUARD_MODE: "随便写" }).mode, "report");
});
