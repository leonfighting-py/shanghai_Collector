// 境外源结果的读取与校验（纯函数 + 薄 IO）。
//
// 链路：offshore.yml（GitHub 托管 runner，境外出口）→ offshore-events.json（artifact）
//      → 主采集下载后由本模块解析 → 交给 collectEventsFromSources 的 extraEvents。
//
// 校验三件事，缺一不可：
//   1. schemaVersion 匹配（格式变了就别硬塞）；
//   2. generatedAt 不能太旧（默认 48h）—— 拿三天前的文件合并等于发布过期活动；
//   3. events 每条必须有标题/开始时间/类目/来源，否则下游 filterPublishableEvents 会崩在奇怪的地方。

import { readFile } from "node:fs/promises";

export const OFFSHORE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_AGE_HOURS = 48;

function isEventShape(item) {
  return Boolean(
    item &&
      typeof item.title === "string" &&
      item.title.trim() &&
      typeof item.start_time === "string" &&
      item.start_time.trim() &&
      typeof item.category === "string" &&
      item.category.trim() &&
      typeof item.source_name === "string" &&
      item.source_name.trim(),
  );
}

/**
 * @returns {{status: "ok"|"disabled"|"stale"|"invalid", events: object[], generatedAt: string|null, reason: string|null}}
 */
export function parseOffshorePayload(text, { now = new Date(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  if (text === undefined || text === null || String(text).trim() === "") {
    return { status: "disabled", events: [], generatedAt: null, reason: null };
  }

  let payload;
  try {
    payload = JSON.parse(String(text));
  } catch (error) {
    return { status: "invalid", events: [], generatedAt: null, reason: `JSON 解析失败：${error.message}` };
  }

  if (Number(payload?.schemaVersion) !== OFFSHORE_SCHEMA_VERSION) {
    return {
      status: "invalid",
      events: [],
      generatedAt: null,
      reason: `schemaVersion=${payload?.schemaVersion}，期望 ${OFFSHORE_SCHEMA_VERSION}`,
    };
  }

  const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : "";
  const generatedTime = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedTime)) {
    return { status: "invalid", events: [], generatedAt: null, reason: "generatedAt 缺失或不是合法时间" };
  }
  const ageHours = (now.getTime() - generatedTime) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return {
      status: "stale",
      events: [],
      generatedAt,
      reason: `境外源结果已过期 ${ageHours.toFixed(1)}h（上限 ${maxAgeHours}h）`,
    };
  }

  const rawEvents = Array.isArray(payload.events) ? payload.events : [];
  const events = rawEvents.filter(isEventShape);
  const dropped = rawEvents.length - events.length;
  return {
    status: "ok",
    events,
    generatedAt,
    reason: dropped > 0 ? `丢弃 ${dropped} 条结构不完整的条目` : null,
  };
}

export async function loadOffshoreEvents(filePath, options = {}) {
  const target = String(filePath || "").trim();
  if (!target) return { status: "disabled", events: [], generatedAt: null, reason: null };
  let text;
  try {
    text = await readFile(target, "utf8");
  } catch (error) {
    return { status: "invalid", events: [], generatedAt: null, reason: `读取 ${target} 失败：${error.message}` };
  }
  return parseOffshorePayload(text, options);
}
