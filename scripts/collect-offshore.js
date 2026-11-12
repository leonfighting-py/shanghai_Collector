// 境外源采集（只读、不写库）：在**境外出口**的 runner 上跑，产出 offshore-events.json 交给主采集合并。
//
// 用法：node scripts/collect-offshore.js [输出路径]
//   · 只跑 SOURCE_SEEDS 里标了 offshore 的源（Eventbrite / 活动行 / AllEvents …）
//   · 不读 DATABASE_URL，不发布 —— 发布仍由主采集（境内 runner）独占，避免全量替换互相清空
//   · 产物 schema 见 src/lib/offshore-events.js 的 OFFSHORE_SCHEMA_VERSION
import { writeFileSync } from "node:fs";

import { collectEventsFromSources, OFFSHORE_SOURCES } from "../src/lib/collector.js";
import { OFFSHORE_SCHEMA_VERSION } from "../src/lib/offshore-events.js";

const outputPath = process.argv[2] || "offshore-events.json";

if (OFFSHORE_SOURCES.length === 0) {
  console.error("没有标记 offshore 的源，直接退出");
  process.exit(0);
}

const startedAt = Date.now();
const result = await collectEventsFromSources({ sources: OFFSHORE_SOURCES, concurrency: 3 });
const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

const payload = {
  schemaVersion: OFFSHORE_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  window: { startDate: result.startDate, endDate: result.endDate, days: result.windowDays },
  sourceCount: OFFSHORE_SOURCES.length,
  collectedCount: result.collectedCount,
  events: result.events,
  failures: result.failures,
};

writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, "utf8");

console.log(`境外源 ${OFFSHORE_SOURCES.length} 个，用时 ${durationSeconds}s`);
console.log(`原始 ${result.collectedCount} 条 → 窗口内可发布 ${result.events.length} 条`);
if (result.failures.length > 0) {
  console.log(`失败 ${result.failures.length} 个：`);
  for (const failure of result.failures) console.log(`  - ${failure.source}: ${failure.message}`);
}
console.log(`已写出 ${outputPath}`);
