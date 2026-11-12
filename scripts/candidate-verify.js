// 候选源实测（只读）：批量 fetch 候选 URL，用指定解析器试抽，输出各自抓取/解析结果。
// 用法：node scripts/candidate-verify.js [candidates.json]
// candidates.json: [{ name, url, category, parser?, venueLabel?, defaultVenue? }]
// parser 缺省为 cnCmsLectures；可用 PARSERS 中任意键名。
import { readFileSync } from "node:fs";
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { PARSERS } from "../src/lib/parsers/index.js";
import { filterPublishableEvents } from "../src/lib/events.js";

const candidates = JSON.parse(readFileSync(process.argv[2] || "/tmp/candidates.json", "utf8"));

async function mapWithLimit(items, limit, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(mapper))));
  }
  return results;
}

async function verify(candidate) {
  const base = { name: candidate.name, url: candidate.url, category: candidate.category };
  const source = {
    name: candidate.name,
    url: candidate.url,
    category: candidate.category || "线下活动",
    venueLabel: candidate.venueLabel,
    defaultVenue: candidate.defaultVenue,
    tier: "T2",
  };
  let html;
  try {
    html = await defaultFetchHtml(candidate.url);
  } catch (error) {
    return { ...base, fetch: "error", error: error instanceof Error ? error.message : String(error), count: 0 };
  }
  const parser = PARSERS[candidate.parser || "cnCmsLectures"];
  try {
    const parsed = await parser(html, source, { fetchHtml: defaultFetchHtml });
    const publishable = filterPublishableEvents(parsed);
    return { ...base, fetch: "ok", bytes: html.length, count: publishable.length, sample: publishable.slice(0, 2).map((e) => e.title) };
  } catch (error) {
    return { ...base, fetch: "ok", bytes: html.length, count: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

const results = await mapWithLimit(candidates, 6, verify);
const good = results.filter((item) => item.fetch === "ok" && item.count > 0);
const zero = results.filter((item) => item.fetch === "ok" && item.count === 0);
const failed = results.filter((item) => item.fetch !== "ok");

console.error(
  `候选 ${results.length} | 可达 ${results.length - failed.length} | 可解析 ${good.length} | 解析为0 ${zero.length} | 不可达 ${failed.length}\n`,
);
console.error("=== 可解析 ===");
for (const item of good.sort((a, b) => b.count - a.count)) console.error(`  ${String(item.count).padStart(3)}  ${item.name}`);
if (zero.length) {
  console.error("\n=== 解析为0 ===");
  for (const item of zero) console.error(`  bytes=${String(item.bytes).padEnd(8)}${item.error ? " ERR:" + item.error.slice(0, 60) : ""}  ${item.name}`);
}
if (failed.length) {
  console.error("\n=== 不可达 ===");
  for (const item of failed) console.error(`  ${item.name}  ${item.error}`);
}
process.stdout.write(JSON.stringify(results, null, 1));
