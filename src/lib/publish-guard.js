// 发布守门：新数据量相对已发布数据暴跌时，拒绝覆盖，保留旧数据并记录告警。
// 背景：发布是"全量替换 14 天窗口"，若半数源临时挂掉，会用差数据静默覆盖好数据。

const DEFAULT_RATIO = 0.6;
const MIN_PREVIOUS = 20; // 旧数据太少时守门无意义（冷启动/换季）

export function getPublishGuardConfig(env = process.env) {
  return {
    ratio: Number(env.PUBLISH_GUARD_RATIO || DEFAULT_RATIO),
    enabled: env.PUBLISH_GUARD_ENABLED !== "false",
  };
}

/**
 * @returns {{allowed: boolean, reason: string|null, previousCount: number, newCount: number}}
 */
export function evaluatePublishGuard(previousEvents, newEvents, { enabled = true, ratio = DEFAULT_RATIO } = {}) {
  const previousCount = Array.isArray(previousEvents) ? previousEvents.length : 0;
  const newCount = Array.isArray(newEvents) ? newEvents.length : 0;

  const base = { previousCount, newCount };

  if (!enabled) return { ...base, allowed: true, reason: null };
  if (previousCount < MIN_PREVIOUS) return { ...base, allowed: true, reason: null };
  if (newCount === 0) return { ...base, allowed: false, reason: "empty_collection" };
  if (newCount < Math.floor(previousCount * ratio)) {
    return { ...base, allowed: false, reason: `drop_below_${ratio}` };
  }

  return { ...base, allowed: true, reason: null };
}

export function publishGuardFailure(decision) {
  return {
    source: "publish-guard",
    message: `发布被守门拦截（${decision.reason}）：新 ${decision.newCount} 条 < 已发布 ${decision.previousCount} 条，保留旧数据`,
  };
}

// ---------------------------------------------------------------------------
// 外地活动守门（路线图 D9）：本站只收录上海的活动。
//
// 判定只看 venue 与 address —— **正文里出现外地城市名不算**，那多半是「巡演城市列表」
// 或「上海站」这类字样造成的误伤。
//
// 已知误伤源：上海路名里带外地城市，如「北京西路」「南京西路」「南京东路」。
// 所以含「上海」字样的一律当上海，不再看城市名；不含上海时才按城市名判定。
// 2026-11-15 实测：266 条里 5 条命中城市名，全部是北京西路/南京西路这类误伤。
// ---------------------------------------------------------------------------

export const OFFSITE_CITIES = [
  "苏州", "杭州", "南京", "无锡", "常州", "嘉兴", "宁波", "绍兴", "湖州", "南通",
  "昆山", "太仓", "常熟", "张家港", "镇江", "扬州", "泰州", "舟山", "金华", "合肥",
  "北京", "深圳", "广州", "成都", "武汉", "西安", "重庆", "天津", "青岛", "厦门",
];

export function getOffsiteGuardConfig(env = process.env) {
  const mode = String(env.OFFSITE_GUARD_MODE || "report").toLowerCase();
  return { mode: mode === "drop" ? "drop" : "report" };
}

/**
 * 判断一条活动是否在上海以外。
 * @returns {{city: string, confident: boolean, evidence: string}|null} 不算外地时返回 null
 */
export function detectOffsite(event) {
  const venue = String(event?.venue || "").trim();
  const address = String(event?.address || "").trim();
  const text = `${venue} ${address}`.trim();
  if (!text) return null;

  // 含「上海」就当上海：北京西路 / 南京西路 / 上海站 都在这条规则下被放过
  if (text.includes("上海")) return null;

  for (const city of OFFSITE_CITIES) {
    if (!text.includes(city)) continue;
    // 上海有「北京西路」「南京东路」这类以别称命名的路，城市名后面直接跟「路」的当成路名放过
    if (new RegExp(`${city}(东|西|南|北|中)?路`).test(text)) continue;
    // 「苏州市」比单写「苏州」更可信；单写城市名可能只是场馆名的一部分
    return { city, confident: new RegExp(`${city}市`).test(text), evidence: text.slice(0, 60) };
  }
  return null;
}

/**
 * 按模式处理外地活动。
 * report：全部保留，只记录清单（用来观察误伤，默认）；drop：真正剔除。
 *
 * @returns {{events: Array<object>, mode: string, dropped: Array<object>}}
 */
export function filterOffsiteEvents(events, { mode = "report" } = {}) {
  const dropped = [];
  const kept = [];
  for (const event of events) {
    const hit = detectOffsite(event);
    if (!hit) {
      kept.push(event);
      continue;
    }
    dropped.push({
      title: event.title,
      category: event.category,
      venue: event.venue || "",
      address: event.address || "",
      city: hit.city,
      confident: hit.confident,
      source_name: event.source_name || "",
    });
    if (mode !== "drop") kept.push(event);
  }
  return { events: kept, mode, dropped };
}
