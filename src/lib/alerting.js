// 告警推送：飞书群机器人 Webhook。
// 只推"需要人介入"的信号——持续失败的源、分类召回塌方、发布被守门拦截；
// 单次偶发失败（超时抖动）不推送，避免告警疲劳。未配置 FEISHU_WEBHOOK_URL 时全部静默跳过。
import { createHmac } from "node:crypto";

const DEFAULT_CONSECUTIVE = 2;
const DEFAULT_HISTORY_LIMIT = 10;
// run 级伪源（不是真实信源），不参与"连续失败信源"统计
const RUN_LEVEL_SOURCES = new Set(["publish-guard"]);

export function getAlertConfig(env = process.env) {
  const threshold = Number(env.ALERT_CONSECUTIVE_FAILURES || DEFAULT_CONSECUTIVE);
  return {
    webhookUrl: env.FEISHU_WEBHOOK_URL || "",
    secret: env.FEISHU_WEBHOOK_SECRET || "",
    consecutiveThreshold: Number.isFinite(threshold) && threshold >= 1 ? threshold : DEFAULT_CONSECUTIVE,
    historyLimit: DEFAULT_HISTORY_LIMIT,
    enabled: Boolean(env.FEISHU_WEBHOOK_URL),
  };
}

// 连续失败统计：runs 需按时间倒序（最近一次在前），且必须包含本次运行。
// 从最近一次往前数，遇到该源没失败的运行即中断，得到"连挂几次"。
export function computeConsecutiveFailures(
  runs,
  { threshold = DEFAULT_CONSECUTIVE, exclude = RUN_LEVEL_SOURCES } = {},
) {
  if (!Array.isArray(runs) || runs.length === 0) return [];

  const perRun = runs.map((run) => {
    const map = new Map();
    for (const failure of run?.failures || []) {
      const name = failure?.source;
      if (!name || exclude.has(name) || map.has(name)) continue;
      map.set(name, failure);
    }
    return map;
  });

  const alerts = [];
  for (const [source, failure] of perRun[0]) {
    let streak = 1;
    for (let index = 1; index < perRun.length; index += 1) {
      if (!perRun[index].has(source)) break;
      streak += 1;
    }
    if (streak >= threshold) {
      alerts.push({
        source,
        consecutive: streak,
        sampledRuns: perRun.length,
        kind: failure?.kind || "unknown",
        message: failure?.message || "",
      });
    }
  }

  return alerts.sort((a, b) => b.consecutive - a.consecutive || a.source.localeCompare(b.source));
}

function clip(text, max = 60) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function shanghaiTime(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

// 组装本次采集告警文本；没有任何需要介入的问题时返回 null（即不推送）。
export function buildCollectAlert(
  { result, runs, categoryBySource = new Map() },
  config = getAlertConfig(),
) {
  const sections = [];

  const persistent = computeConsecutiveFailures(runs, { threshold: config.consecutiveThreshold });
  if (persistent.length > 0) {
    const lines = [`连续失败 ≥${config.consecutiveThreshold} 次的源（取样最近 ${persistent[0].sampledRuns} 次采集）：`];
    for (const item of persistent) {
      const category = categoryBySource.get(item.source);
      lines.push(
        `· ${item.source}${category ? `（${category}）` : ""} — 连挂 ${item.consecutive} 次｜${item.kind}｜${clip(item.message)}`,
      );
    }
    lines.push("→ 建议补源或修复解析规则");
    sections.push(lines.join("\n"));
  }

  const protectedCategories = result?.category_drop_protection?.protectedCategories || [];
  if (protectedCategories.length > 0) {
    sections.push(`分类召回塌方（已用上次旧数据顶替）：${protectedCategories.join("、")}`);
  }

  if (result?.publish_guard?.allowed === false) {
    const guard = result.publish_guard;
    sections.push(
      `发布守门拦截：${guard.reason}（新 ${guard.newCount} 条 < 已发布 ${guard.previousCount} 条），本次未覆盖旧数据`,
    );
  }

  if (sections.length === 0) return null;

  const failureCount = (result?.failures || []).length;
  const header = [
    `【上海活动采集告警】${shanghaiTime()}`,
    `本次：召回 ${result?.collectedCount ?? "-"} 条 → 可发布 ${result?.publishedCount ?? "-"} 条，失败源 ${failureCount} 个`,
  ].join("\n");

  return `${header}\n\n${sections.join("\n\n")}`;
}

// 飞书自定义机器人：text 消息 +（可选）签名校验。
export async function sendFeishuText(text, { webhookUrl, secret } = {}, fetchImpl = fetch) {
  if (!webhookUrl) return { sent: false, reason: "no_webhook" };

  const body = { msg_type: "text", content: { text } };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    body.timestamp = timestamp;
    body.sign = createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
  }

  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  const code = payload?.code ?? payload?.StatusCode;
  const ok = response.ok && (code === 0 || code === undefined);
  return {
    sent: ok,
    status: response.status,
    reason: ok ? null : payload?.msg || payload?.StatusMessage || `http_${response.status}`,
  };
}

// 采集后的告警入口：无告警内容时不产生任何网络请求。
export async function notifyCollectAlert(payload, options = {}) {
  const config = getAlertConfig(options.env || process.env);
  if (!config.enabled) return { sent: false, reason: "disabled" };

  const text = buildCollectAlert(payload, config);
  if (!text) return { sent: false, reason: "no_alert" };

  try {
    return await sendFeishuText(text, { webhookUrl: config.webhookUrl, secret: config.secret }, options.fetchImpl || fetch);
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
