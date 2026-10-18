import test from "node:test";
import assert from "node:assert/strict";

import { OFFSHORE_SCHEMA_VERSION, parseOffshorePayload } from "../src/lib/offshore-events.js";
import { collectEventsFromSources } from "../src/lib/collector.js";

const now = new Date("2026-10-18T03:00:00Z");

function event(overrides = {}) {
  return {
    title: "Eventbrite 测试活动",
    start_time: "2026-10-20T11:00:00.000Z",
    end_time: null,
    venue: "上海",
    category: "线下活动",
    signup_url: "https://www.eventbrite.com/e/test",
    source_name: "Eventbrite 上海·免费",
    source_url: "https://www.eventbrite.com/e/test",
    image_url: null,
    source_tier: "T2",
    ...overrides,
  };
}

function payload(overrides = {}) {
  return JSON.stringify({
    schemaVersion: OFFSHORE_SCHEMA_VERSION,
    generatedAt: "2026-10-18T02:40:00Z",
    window: { startDate: "2026-10-18", endDate: "2026-10-31", days: 14 },
    events: [event()],
    ...overrides,
  });
}

test("境外产物：正常文件解析出事件", () => {
  const result = parseOffshorePayload(payload(), { now });
  assert.equal(result.status, "ok");
  assert.equal(result.events.length, 1);
  assert.equal(result.reason, null);
});

test("境外产物：空内容视为未配置（不告警）", () => {
  const result = parseOffshorePayload("", { now });
  assert.equal(result.status, "disabled");
  assert.equal(result.events.length, 0);
});

test("境外产物：超过 48h 判定过期，一条都不合并", () => {
  const stale = payload({ generatedAt: "2026-10-15T00:00:00Z" });
  const result = parseOffshorePayload(stale, { now });
  assert.equal(result.status, "stale");
  assert.equal(result.events.length, 0);
  assert.match(result.reason, /过期/);
});

test("境外产物：schemaVersion 不匹配直接拒绝", () => {
  const result = parseOffshorePayload(payload({ schemaVersion: 99 }), { now });
  assert.equal(result.status, "invalid");
  assert.match(result.reason, /schemaVersion/);
});

test("境外产物：JSON 坏掉返回 invalid，不抛异常", () => {
  const result = parseOffshorePayload("{not json", { now });
  assert.equal(result.status, "invalid");
  assert.equal(result.events.length, 0);
});

test("境外产物：结构不完整的条目被丢弃，其余保留", () => {
  const bad = payload({ events: [event(), { title: "", start_time: "" }, { title: "缺来源", start_time: "2026-10-20T11:00:00.000Z", category: "线下活动" }] });
  const result = parseOffshorePayload(bad, { now });
  assert.equal(result.status, "ok");
  assert.equal(result.events.length, 1);
  assert.match(result.reason, /丢弃 2 条/);
});

test("extraEvents：并入后走同一套窗口过滤与去重", async () => {
  const events = await collectEventsFromSources({
    sources: [],
    extraEvents: [
      event({ title: "窗口内的线下活动一场", start_time: "2026-10-20T11:00:00.000Z" }),
      event({ title: "窗口外的线下活动一场", start_time: "2026-12-20T11:00:00.000Z", signup_url: "https://www.eventbrite.com/e/out" }),
      event({ title: "窗口内的线下活动一场", start_time: "2026-10-20T11:00:00.000Z" }),
    ],
    now,
    respectRobots: false,
  });
  assert.equal(events.collectedCount, 3);
  assert.deepEqual(events.events.map((item) => item.title), ["窗口内的线下活动一场"]);
  assert.equal(events.failures.length, 0);
});

test("extraEvents：为空时行为与原来一致（不产生事件）", async () => {
  const events = await collectEventsFromSources({ sources: [], now, respectRobots: false });
  assert.equal(events.events.length, 0);
  assert.equal(events.collectedCount, 0);
});
