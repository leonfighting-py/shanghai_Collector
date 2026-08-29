// 源召回率体检：逐源 fetch + parse，输出健康报告（只读，不写数据库）
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCE_SEEDS } from "../src/lib/collector.js";
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { filterPublishableEvents, toShanghaiDayWindow } from "../src/lib/events.js";

const CONCURRENCY = 5;
const SOURCE_TIMEOUT_MS = 60_000;

async function probeSource(source, now) {
  const startedAt = Date.now();
  const { startDate, endDate, days } = toShanghaiDayWindow(now);
  try {
    const html = await Promise.race([
      defaultFetchHtml(source.url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`fetch timed out after ${SOURCE_TIMEOUT_MS / 1000}s`)), SOURCE_TIMEOUT_MS),
      ),
    ]);
    const parsed = await source.parser(html, source, { fetchHtml: defaultFetchHtml, now, window: { startDate, endDate, days } });
    const publishable = filterPublishableEvents(parsed);
    return {
      source: source.name,
      category: source.category,
      status: "ok",
      rawCount: parsed.length,
      publishableCount: publishable.length,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      source: source.name,
      category: source.category,
      status: "error",
      rawCount: 0,
      publishableCount: 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const now = new Date();
const results = [];

for (let index = 0; index < SOURCE_SEEDS.length; index += CONCURRENCY) {
  const chunk = SOURCE_SEEDS.slice(index, index + CONCURRENCY);
  results.push(...(await Promise.all(chunk.map((source) => probeSource(source, now)))));
}

results.sort((left, right) => {
  const rank = (item) => (item.status === "ok" && item.rawCount > 0 ? 0 : item.status === "ok" ? 1 : 2);
  return rank(left) - rank(right) || left.source.localeCompare(right.source);
});

const totalRaw = results.reduce((sum, item) => sum + item.rawCount, 0);
const totalPublishable = results.reduce((sum, item) => sum + item.publishableCount, 0);
const okSources = results.filter((item) => item.status === "ok").length;
const zombieSources = results.filter((item) => item.status === "ok" && item.rawCount === 0);
const failedSources = results.filter((item) => item.status === "error");

const lines = [];
lines.push(`# 源召回率体检报告`);
lines.push("");
lines.push(`- 时间：${now.toISOString()}`);
lines.push(`- 源总数：${results.length}`);
lines.push(`- fetch 成功：${okSources} / ${results.length}`);
lines.push(`- 僵尸源（fetch 成功但解析 0 条）：${zombieSources.length}`);
lines.push(`- 失败源（fetch/解析报错）：${failedSources.length}`);
lines.push(`- 原始召回总数：${totalRaw}`);
lines.push(`- 可发布总数：${totalPublishable}`);
lines.push("");
lines.push("## 明细（按健康度排序）");
lines.push("");
lines.push("| 源 | 分类 | 状态 | 原始条数 | 可发布 | 耗时(ms) | 错误 |");
lines.push("|---|---|---|---|---|---|---|");
for (const item of results) {
  const status = item.status === "error" ? "❌ error" : item.rawCount === 0 ? "🟡 zombie" : "✅ ok";
  lines.push(`| ${item.source} | ${item.category} | ${status} | ${item.rawCount} | ${item.publishableCount} | ${item.durationMs} | ${item.error ? item.error.slice(0, 80) : ""} |`);
}

const report = lines.join("\n");
const reportDir = fileURLToPath(new URL(".", import.meta.url));
const reportPath = join(reportDir, "source-health-report.md");
mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, report, "utf8");
writeFileSync(join(reportDir, "source-health-report.json"), JSON.stringify(results, null, 2), "utf8");

console.log(report);
console.log(`\n报告已写入: ${reportPath}`);
