// 大范围候选探活（只读）：只判断域名可达性 + 页面是否含活动结构（JSON-LD/日期+链接），
// 用于先快速筛掉不可达/纯 JS 站点，再对留下来的写解析器。
import { readFileSync } from "node:fs";
import { defaultFetchHtml } from "../src/lib/fetch-html.js";

const CANDIDATES = JSON.parse(readFileSync(process.argv[2], "utf8"));

async function mapLimit(items, limit, mapper) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(mapper))));
  }
  return out;
}

async function probe(item) {
  try {
    const html = await defaultFetchHtml(item.url);
    const ld = (html.match(/application\/ld\+json/g) || []).length;
    const events = (html.match(/"@type"\s*:\s*"?Event"?/gi) || []).length;
    const dates = (html.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g) || []).length;
    const links = (html.match(/<a\b[^>]+href=/gi) || []).length;
    return { ...item, ok: true, bytes: html.length, ld, events, dates, links };
  } catch (error) {
    return { ...item, ok: false, error: (error.message || "").slice(0, 44) };
  }
}

const results = await mapLimit(CANDIDATES, 8, probe);
const good = results.filter((r) => r.ok && (r.events > 0 || r.ld > 0 || r.dates >= 5));
const plain = results.filter((r) => r.ok && !(r.events > 0 || r.ld > 0 || r.dates >= 5));
const bad = results.filter((r) => !r.ok);

console.error(`候选 ${results.length} | 有活动特征 ${good.length} | 可达但无特征 ${plain.length} | 不可达 ${bad.length}\n`);
console.error("=== 有活动特征 ===");
for (const r of good.sort((a, b) => b.events - a.events || b.dates - a.dates)) {
  console.error(`  Event:${String(r.events).padStart(3)} LD:${String(r.ld).padStart(2)} 日期:${String(r.dates).padStart(4)} ${String(r.bytes).padStart(7)}B  ${r.name}`);
}
console.error("\n=== 可达但需另写解析器 ===");
for (const r of plain.sort((a, b) => b.dates - a.dates)) {
  console.error(`  日期:${String(r.dates).padStart(4)} 链接:${String(r.links).padStart(4)} ${String(r.bytes).padStart(7)}B  ${r.name}`);
}
console.error("\n=== 不可达 ===");
for (const r of bad) console.error(`  ${r.name}  ${r.error}`);
