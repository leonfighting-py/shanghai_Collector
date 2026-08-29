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
