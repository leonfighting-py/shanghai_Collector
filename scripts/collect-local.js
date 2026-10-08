import { appendFileSync } from "node:fs";

import { getAlertConfig, notifyCollectAlert, notifyFatalError } from "../src/lib/alerting.js";
import { runCollectJob } from "../src/lib/collect-job.js";
import { shouldFailCollectProcess } from "../src/lib/collect-result.js";
import { SOURCE_SEEDS } from "../src/lib/collector.js";
import { listRecentCollectionRuns } from "../src/lib/repository.js";

// 致命错误的统一出口：推飞书 + 写 Step Summary + 把原文打到 stderr。
// 2026-10-07 事故复盘：数据库不可达时进程在第一步就退出，告警链路从没跑过。
// 所以致命路径必须自带告警，不能指望采集流程跑完之后的收尾逻辑。
async function reportFatal(stage, error) {
  const alertResult = await notifyFatalError({ stage, error });
  console.error(`[alert] 致命告警 ${alertResult.sent ? "已推送" : `未推送（${alertResult.reason}）`}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [`## 采集致命错误（${stage}）`, "", "```", String(error?.stack || error), "```", ""].join("\n"),
    );
  }
}

if (!process.env.DATABASE_URL) {
  const error = new Error("DATABASE_URL is required");
  // 连配置都缺，进程立刻退；但也要让人收到通知，否则又是一次静默失败。
  await reportFatal("启动检查", error);
  throw error;
}

let result;
try {
  result = await runCollectJob();
} catch (error) {
  await reportFatal("runCollectJob", error);
  throw error;
}

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
// ⚠️ listRecentCollectionRuns 本身是一次数据库读取 —— 采集已成功、只是这一步挂掉时，
//    绝不能让它把整个进程带崩（那会把一次成功的采集变成一次失败的运行）。
//    推送失败同样不影响采集结果，仅打印原因。
const alertConfig = getAlertConfig();
if (alertConfig.enabled) {
  try {
    const runs = await listRecentCollectionRuns({ limit: alertConfig.historyLimit });
    const categoryBySource = new Map(SOURCE_SEEDS.map((source) => [source.name, source.category]));
    const alertResult = await notifyCollectAlert({ result, runs, categoryBySource });
    console.log(`[alert] ${alertResult.sent ? "已推送告警" : `未推送（${alertResult.reason}）`}`);
  } catch (error) {
    console.error(`[alert] 告警链路自身出错，已忽略（不影响本次采集结果）：${error?.message || error}`);
  }
}

console.log(JSON.stringify(result, null, 2));

if (shouldFailCollectProcess(result)) {
  process.exitCode = 1;
}
