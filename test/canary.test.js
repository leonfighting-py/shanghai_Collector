import test from "node:test";
import assert from "node:assert/strict";

import { buildCanaryAlert, evaluateProbe, getCanaryConfig, runCanary } from "../scripts/canary.mjs";

// 2026-10-07 事故：数据库不可达 → 采集在第一步崩溃 → 告警没发出 → 静默两天。
// 这个探针是那次事故的对策，所以判定逻辑必须逐条钉死。

function jsonResponse(payload, status = 200) {
  return { status, text: async () => JSON.stringify(payload) };
}

test("a healthy response passes the probe", () => {
  const probe = evaluateProbe({ status: 200, body: JSON.stringify({ events: [{ id: 1 }, { id: 2 }] }) });
  assert.equal(probe.ok, true);
  assert.equal(probe.count, 2);
});

test("a non-200 status fails with the status preserved", () => {
  const probe = evaluateProbe({ status: 500, body: "" });
  assert.equal(probe.ok, false);
  assert.equal(probe.reason, "bad_status");
  assert.equal(probe.detail, "HTTP 500");
});

test("a transport error is reported as request_failed", () => {
  const probe = evaluateProbe({ error: new Error("getaddrinfo ENOTFOUND db.example.supabase.co") });
  assert.equal(probe.ok, false);
  assert.equal(probe.reason, "request_failed");
  assert.match(probe.detail, /ENOTFOUND/);
});

test("HTML error pages and missing events arrays are distinguished", () => {
  const html = evaluateProbe({ status: 200, body: "<!DOCTYPE html><html>" });
  assert.equal(html.reason, "invalid_json");

  const noArray = evaluateProbe({ status: 200, body: JSON.stringify({ items: [] }) });
  assert.equal(noArray.reason, "no_events_array");
});

test("an empty list counts as failure, not success", () => {
  const probe = evaluateProbe({ status: 200, body: JSON.stringify({ events: [] }) });
  assert.equal(probe.ok, false);
  assert.equal(probe.reason, "too_few_events");
  assert.equal(probe.count, 0);
});

test("a bare array body is accepted, and minEvents is honoured", () => {
  assert.equal(evaluateProbe({ status: 200, body: JSON.stringify([{ id: 1 }]) }).ok, true);
  const strict = evaluateProbe({ status: 200, body: JSON.stringify({ events: [{ id: 1 }] }), minEvents: 5 });
  assert.equal(strict.ok, false);
  assert.equal(strict.reason, "too_few_events");
});

test("the alert names the probe target and the triage order", () => {
  const text = buildCanaryAlert(
    { probe: { reason: "bad_status", detail: "HTTP 500" }, apiUrl: "https://example.com/api/events" },
  );
  assert.match(text, /线上探针告警/);
  assert.match(text, /https:\/\/example\.com\/api\/events/);
  assert.match(text, /HTTP 500/);
  assert.match(text, /Supabase/);
});

test("config falls back to safe defaults and rejects nonsense", () => {
  const base = getCanaryConfig({});
  assert.equal(base.apiUrl, "https://news.leoncoooolest.com/api/events");
  assert.equal(base.minEvents, 1);
  assert.equal(base.timeoutMs, 30000);

  assert.equal(getCanaryConfig({ CANARY_MIN_EVENTS: "abc" }).minEvents, 1);
  assert.equal(getCanaryConfig({ CANARY_TIMEOUT_MS: "-5" }).timeoutMs, 30000);
});

test("runCanary stays quiet when production is healthy", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse({ events: [{ id: 1 }] });
  };

  const result = await runCanary({
    env: { FEISHU_WEBHOOK_URL: "https://example.com/hook" },
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1, "健康时不产生任何告警请求");
});

test("runCanary pushes a feishu alert when production is broken", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (url.includes("/api/events")) return { status: 500, text: async () => "" };
    return { ok: true, status: 200, json: async () => ({ code: 0 }) };
  };

  const result = await runCanary({
    env: { FEISHU_WEBHOOK_URL: "https://example.com/hook" },
    fetchImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.alert.sent, true);

  const hook = calls.find((c) => c.url === "https://example.com/hook");
  assert.ok(hook, "应把告警发到 webhook");
  assert.equal(hook.body.msg_type, "text");
  assert.match(hook.body.content.text, /线上探针告警/);
  assert.match(hook.body.content.text, /HTTP 500/);
});

test("runCanary does not throw when the webhook is unset or itself fails", async () => {
  const failingEndpoint = async (url) => {
    if (url.includes("/api/events")) throw new Error("socket hang up");
    throw new Error("webhook down");
  };

  const noHook = await runCanary({ env: {}, fetchImpl: failingEndpoint });
  assert.equal(noHook.ok, false);
  assert.deepEqual(noHook.alert, { sent: false, reason: "no_webhook" });

  const hookDown = await runCanary({ env: { FEISHU_WEBHOOK_URL: "https://example.com/hook" }, fetchImpl: failingEndpoint });
  assert.equal(hookDown.ok, false);
  assert.equal(hookDown.alert.sent, false, "告警通道自身故障不能把探针也带崩，只需上报失败原因");
});
