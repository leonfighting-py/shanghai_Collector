import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCollectAlert,
  computeConsecutiveFailures,
  getAlertConfig,
  sendFeishuText,
  shanghaiTime,
} from "../src/lib/alerting.js";

function run(failures) {
  return { failures };
}

test("consecutive failures count from the most recent run backwards", () => {
  const runs = [
    run([{ source: "A", kind: "timeout", message: "timed out" }]),
    run([{ source: "A", kind: "timeout", message: "timed out" }]),
    run([{ source: "A", kind: "http_4xx", message: "HTTP 403" }, { source: "B", kind: "parse", message: "0 parsed" }]),
    run([{ source: "A", kind: "timeout", message: "timed out" }]),
  ];

  const alerts = computeConsecutiveFailures(runs, { threshold: 2 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].source, "A");
  assert.equal(alerts[0].consecutive, 4);
  assert.equal(alerts[0].sampledRuns, 4);
  assert.equal(alerts[0].kind, "timeout", "应报告最近一次失败的类型");
});

test("a successful run breaks the streak", () => {
  const runs = [
    run([{ source: "A", message: "boom" }]),
    run([]), // A 这次成功 → 连挂止步于 1
    run([{ source: "A", message: "boom" }]),
  ];
  assert.deepEqual(computeConsecutiveFailures(runs, { threshold: 2 }), []);
});

test("threshold, run-level pseudo sources and empty input are handled", () => {
  const runsWithGuard = [run([{ source: "publish-guard", message: "守门拦截" }])];
  assert.deepEqual(computeConsecutiveFailures(runsWithGuard, { threshold: 1 }), []);

  const single = [run([{ source: "A", message: "boom" }])];
  assert.equal(computeConsecutiveFailures(single, { threshold: 2 }).length, 0);
  assert.equal(computeConsecutiveFailures(single, { threshold: 1 }).length, 1);
  assert.deepEqual(computeConsecutiveFailures([], { threshold: 1 }), []);
  assert.deepEqual(computeConsecutiveFailures(undefined, { threshold: 1 }), []);
});

test("no alert is produced for a healthy run", () => {
  const result = {
    collectedCount: 120,
    publishedCount: 80,
    failures: [],
    publish_guard: { allowed: true },
    category_drop_protection: { protectedCategories: [] },
  };
  assert.equal(buildCollectAlert({ result, runs: [run([])] }, getAlertConfig({})), null);
});

test("alert text aggregates persistent sources, category collapse and guard block", () => {
  const result = {
    collectedCount: 30,
    publishedCount: 10,
    failures: [{ source: "上海科技大学·信息学院卓越讲座", message: "HTTP 403" }],
    publish_guard: { allowed: false, reason: "drop_below_0.6", newCount: 10, previousCount: 60 },
    category_drop_protection: { protectedCategories: ["高校讲座"] },
  };
  const runs = [
    run([{ source: "上海科技大学·信息学院卓越讲座", kind: "http_4xx", message: "HTTP 403" }]),
    run([{ source: "上海科技大学·信息学院卓越讲座", kind: "http_4xx", message: "HTTP 403" }]),
  ];
  const categoryBySource = new Map([["上海科技大学·信息学院卓越讲座", "高校讲座"]]);

  const text = buildCollectAlert({ result, runs, categoryBySource }, getAlertConfig({}));

  assert.match(text, /上海活动采集告警/);
  assert.match(text, /连挂 2 次/);
  assert.match(text, /（高校讲座）/);
  assert.match(text, /分类召回塌方.*高校讲座/);
  assert.match(text, /发布守门拦截.*drop_below_0\.6/);
});

test("alert config defaults and overrides", () => {
  assert.deepEqual(
    { enabled: getAlertConfig({}).enabled, threshold: getAlertConfig({}).consecutiveThreshold },
    { enabled: false, threshold: 2 },
  );
  const tuned = getAlertConfig({ FEISHU_WEBHOOK_URL: "https://example.com/hook", ALERT_CONSECUTIVE_FAILURES: "3" });
  assert.equal(tuned.enabled, true);
  assert.equal(tuned.consecutiveThreshold, 3);
  assert.equal(getAlertConfig({ ALERT_CONSECUTIVE_FAILURES: "0" }).consecutiveThreshold, 2, "非法阈值回落默认值");
});

test("sendFeishuText skips without webhook and reports feishu error codes", async () => {
  assert.deepEqual(await sendFeishuText("hi", {}), { sent: false, reason: "no_webhook" });

  let captured = null;
  const okFetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ code: 0, msg: "success" }) };
  };
  const sent = await sendFeishuText("hello", { webhookUrl: "https://example.com/hook" }, okFetch);
  assert.equal(sent.sent, true);
  assert.equal(captured.body.msg_type, "text");
  assert.equal(captured.body.content.text, "hello");
  assert.equal(captured.body.sign, undefined, "未配置密钥时不签名");

  const signed = await sendFeishuText("hi", { webhookUrl: "https://example.com/hook", secret: "s3cret" }, okFetch);
  assert.equal(signed.sent, true);
  assert.ok(captured.body.timestamp);
  assert.ok(captured.body.sign);

  const failFetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 19021, msg: "sign match fail" }) });
  const failed = await sendFeishuText("hi", { webhookUrl: "https://example.com/hook" }, failFetch);
  assert.equal(failed.sent, false);
  assert.equal(failed.reason, "sign match fail");
});

test("alert timestamps are rendered in Asia/Shanghai", () => {
  const text = shanghaiTime(new Date("2026-10-01T14:30:00Z"));
  assert.match(text, /2026\/10\/01/);
  assert.match(text, /22:30/);
});
