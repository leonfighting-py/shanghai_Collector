// 端到端哨兵：只问一句「线上现在还有数据吗？」
//
// 为什么必须单独做（2026-10-07 生产事故）：
//   Supabase 项目不可达后，采集任务在**第一步** listEvents 就抛错退出，连告警代码都
//   没跑到，生产静默停摆两天全靠人工发现。根因是结构性的 —— 采集类任务的告警挂在
//   采集流程上，而采集流程本身依赖数据库，两者同生共死。
//   所以需要一个**不碰数据库驱动、不依赖采集链路任何环节**的探针，直接看用户能看到的结果。
//
// 设计约束：
//   · 零第三方依赖（只 import 仓库自己的 alerting.js），不用 npm ci，跑得比采集快得多
//   · 不引入 pg / 不读 DATABASE_URL —— 探针本身不能有和被测对象相同的失效模式
//   · 探测目标走 HTTPS：Worker → Hyperdrive → Supabase 整条链路，任一环断了都会体现在这里
//
// 用法：node scripts/canary.mjs
// 环境变量：
//   CANARY_API_URL    默认 https://news.leoncoooolest.com/api/events
//   CANARY_MIN_EVENTS 默认 1，低于该条数视为异常（0 条也算故障：可能是库空了）
//   CANARY_TIMEOUT_MS 默认 30000
//   FEISHU_WEBHOOK_URL / FEISHU_WEBHOOK_SECRET
import { pathToFileURL } from "node:url";

import { sendFeishuText, shanghaiTime } from "../src/lib/alerting.js";

export const DEFAULT_API_URL = "https://news.leoncoooolest.com/api/events";

function clip(text, max = 200) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function getCanaryConfig(env = process.env) {
  const min = Number(env.CANARY_MIN_EVENTS ?? 1);
  const timeout = Number(env.CANARY_TIMEOUT_MS ?? 30000);
  return {
    apiUrl: env.CANARY_API_URL || DEFAULT_API_URL,
    minEvents: Number.isFinite(min) && min >= 0 ? min : 1,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    webhookUrl: env.FEISHU_WEBHOOK_URL || "",
    secret: env.FEISHU_WEBHOOK_SECRET || "",
  };
}

// 纯函数：把一次 HTTP 探测的原始结果判成健康/故障。抽出来是为了能单测，不用真联网。
export function evaluateProbe({ status, body, error, minEvents = 1 } = {}) {
  if (error) {
    return { ok: false, reason: "request_failed", detail: clip(error.message || error), count: null };
  }
  if (status !== 200) {
    return { ok: false, reason: "bad_status", detail: `HTTP ${status}`, count: null };
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, reason: "invalid_json", detail: clip(body), count: null };
  }

  // /api/events 返回 { events: [...] }；容错接受裸数组。
  const events = Array.isArray(payload) ? payload : payload?.events;
  if (!Array.isArray(events)) {
    return { ok: false, reason: "no_events_array", detail: clip(body), count: null };
  }
  if (events.length < minEvents) {
    return { ok: false, reason: "too_few_events", detail: `只拿到 ${events.length} 条（下限 ${minEvents}）`, count: events.length };
  }

  return { ok: true, reason: null, detail: `${events.length} 条`, count: events.length };
}

export function buildCanaryAlert({ probe, apiUrl }) {
  const reasonText = {
    request_failed: "请求没发出去或连接失败",
    bad_status: "接口返回了非 200",
    invalid_json: "返回的不是 JSON",
    no_events_array: "返回体里没有 events 数组",
    too_few_events: "返回的条目数低于下限",
  }[probe.reason] || probe.reason;

  return [
    `【上海活动雷达｜线上探针告警】${shanghaiTime()}`,
    `探针：${apiUrl}`,
    `判定：${reasonText}`,
    `详情：${probe.detail}`,
    "",
    "→ 线上活动列表当前不可用，用户看到的是空页面",
    "→ 排查顺序：① Supabase 项目是否被暂停/删除 ② Cloudflare Hyperdrive 配置 ③ Worker 部署状态",
  ].join("\n");
}

// 探测 → 异常则告警。返回结构化结果，方便 workflow 决定退出码。
export async function runCanary(options = {}) {
  const config = { ...getCanaryConfig(options.env || process.env), ...(options.config || {}) };
  const fetchImpl = options.fetchImpl || fetch;

  let status = 0;
  let body = "";
  let error = null;
  try {
    const response = await fetchImpl(config.apiUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    status = response.status;
    body = await response.text();
  } catch (err) {
    error = err;
  }

  const probe = evaluateProbe({ status, body, error, minEvents: config.minEvents });
  if (probe.ok) {
    console.log(`[canary] 正常：${config.apiUrl} → 200，${probe.detail}`);
    return { ok: true, probe };
  }

  console.error(`[canary] 异常：${probe.reason} — ${probe.detail}`);

  const text = buildCanaryAlert({ probe, apiUrl: config.apiUrl });
  let alert = { sent: false, reason: "no_webhook" };
  if (config.webhookUrl) {
    try {
      alert = await sendFeishuText(text, { webhookUrl: config.webhookUrl, secret: config.secret }, fetchImpl);
    } catch (err) {
      alert = { sent: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
  console.error(`[canary] 告警 ${alert.sent ? "已推送" : `未推送（${alert.reason}）`}`);

  return { ok: false, probe, alert, text };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const result = await runCanary();
  if (!result.ok) process.exitCode = 1;
}
