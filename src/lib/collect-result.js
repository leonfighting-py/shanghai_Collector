// 采集结果判定：进程退出码（原有）+ 运行状态分级（2026-11-11 方案 WP0-D）。
// 保持零依赖纯函数，便于单测和云函数复制。

export function shouldFailCollectProcess(result) {
  if (result?.publish_guard?.allowed === false) return true;
  return Number(result?.published_inserted || 0) === 0 || Number(result?.raw_inserted || 0) === 0;
}

// run 级伪源（不是真实信源），不参与"失败信源"统计。与 alerting.js 的口径保持一致。
const RUN_LEVEL_SOURCES = new Set(["publish-guard"]);

// 统计失败信源数：按 source 名去重，跳过伪源和无 source 的条目
// （enrichment / category-filter 的失败是批次级、没有 source 字段，天然不进占比）。
export function countFailedSources(failures) {
  if (!Array.isArray(failures)) return 0;
  const names = new Set();
  for (const failure of failures) {
    const name = failure?.source;
    if (name && !RUN_LEVEL_SOURCES.has(name)) names.add(name);
  }
  return names.size;
}

// 失败信源占比超过该阈值时，运行记 degraded 而不是 success。
const DEGRADED_FAILURE_RATIO = 0.05;

// 运行状态三档判定（纯函数）：
//   success  —— 守门通过且失败信源占比 ≤ 5%（可忽略的抖动）
//   degraded —— 守门通过但失败信源占比 > 5%（产出可用，但供给面在恶化，值得关注）
//   blocked  —— 发布守门拦截，或本轮回退到了旧数据（线上内容没有更新）
// 背景：旧口径只有 success / partial 且"有一个信源失败就记 partial"，
// 261 个源里挂 1 个和挂 50 个都是 partial，区分不出好坏。历史行保留 partial 不回填。
// collection_runs.status 是 text 列，无需改表。
export function classifyRunStatus({
  guardAllowed = true,
  fellBackToOldData = false,
  failedSourceCount = 0,
  sourceCount = 0,
} = {}) {
  if (!guardAllowed || fellBackToOldData) return "blocked";
  if (sourceCount <= 0) return failedSourceCount > 0 ? "degraded" : "success";
  const ratio = failedSourceCount / sourceCount;
  return ratio <= DEGRADED_FAILURE_RATIO ? "success" : "degraded";
}
