import { appendFileSync } from "node:fs";

import { runCollectJob } from "../src/lib/collect-job.js";
import { shouldFailCollectProcess } from "../src/lib/collect-result.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const result = await runCollectJob();

// GitHub Actions：写入 Step Summary，采集异常时以失败退出（触发 Actions 通知）
if (process.env.GITHUB_STEP_SUMMARY) {
  const guard = result.publish_guard || { allowed: true, reason: null };
  const failedSources = (result.failures || []).map((f) => `- ${f.source || f.message}: ${f.message}`).join("\n");
  const summary = [
    "## 采集运行摘要",
    "",
    `- 运行 ID：${result.run_id}`,
    `- 召回：${result.collectedCount} 条原始 → ${result.publishedCount} 条可发布（窗口 ${result.startDate} ~ ${result.endDate}）`,
    `- 入库：raw ${result.raw_inserted} / published ${result.published_inserted}`,
    `- LLM 润色：${result.enrichment?.enrichedCount ?? 0} 条（${result.enrichment?.provider || "disabled"}）`,
    `- 发布守门：${guard.allowed ? "通过" : `拦截（${guard.reason}，新 ${guard.newCount} < 旧 ${guard.previousCount}）`}`,
    "",
    failedSources ? `### 失败源（${result.failures.length}）\n${failedSources}` : "### 全部源成功",
    "",
  ].join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

console.log(JSON.stringify(result, null, 2));

if (shouldFailCollectProcess(result)) {
  process.exitCode = 1;
}
