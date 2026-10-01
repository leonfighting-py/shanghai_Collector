import { appendFileSync } from "node:fs";

import { getAlertConfig, notifyCollectAlert } from "../src/lib/alerting.js";
import { runCollectJob } from "../src/lib/collect-job.js";
import { shouldFailCollectProcess } from "../src/lib/collect-result.js";
import { SOURCE_SEEDS } from "../src/lib/collector.js";
import { listRecentCollectionRuns } from "../src/lib/repository.js";

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
    `- 封面图：回填 ${result.image_backfill?.backfilled ?? 0}/${result.image_backfill?.attempted ?? 0} 条`,
    `- LLM 预算：${result.llm_budget?.used ?? 0}/${result.llm_budget?.cap ?? "-"} 次调用（${result.llm_budget?.enabled ? "已启用熔断" : "未启用"}）`,
    `- 发布守门：${guard.allowed ? "通过" : `拦截（${guard.reason}，新 ${guard.newCount} < 旧 ${guard.previousCount}）`}`,
    "",
    failedSources ? `### 失败源（${result.failures.length}）\n${failedSources}` : "### 全部源成功",
    "",
  ].join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

// 告警：只推需要人介入的信号（连续失败源 / 分类塌方 / 守门拦截）。
// 本次运行已在上面 finishCollectionRun 落库，因此历史 runs 的第一条就是本次。
// 推送失败不影响采集结果，仅打印原因。
const alertConfig = getAlertConfig();
if (alertConfig.enabled) {
  const runs = await listRecentCollectionRuns({ limit: alertConfig.historyLimit });
  const categoryBySource = new Map(SOURCE_SEEDS.map((source) => [source.name, source.category]));
  const alertResult = await notifyCollectAlert({ result, runs, categoryBySource });
  console.log(`[alert] ${alertResult.sent ? "已推送告警" : `未推送（${alertResult.reason}）`}`);
}

console.log(JSON.stringify(result, null, 2));

if (shouldFailCollectProcess(result)) {
  process.exitCode = 1;
}
