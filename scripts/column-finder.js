// 通用栏目定位器（只读）：给任意机构主页，找出标题像「讲座/学术活动/培训/会议/活动预告」的栏目链接，
// 并对每个候选栏目用指定解析器实测（支持 HTML 页与 JSON API）。
import { readFileSync } from "node:fs";
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { PARSERS } from "../src/lib/parsers/index.js";
import { filterPublishableEvents, isInDateRange, toShanghaiDayWindow } from "../src/lib/events.js";

const seeds = JSON.parse(readFileSync(process.argv[2], "utf8"));
const parserKey = process.argv[3] || "cnCmsLectures";
const { startDate, endDate } = toShanghaiDayWindow(new Date());

const COLUMN_TEXT =
  /(讲座|学术活动|学术报告|报告会|活动预告|学术星空|讲坛|论坛|沙龙|会议|培训|继教|继教项目|学术前沿|学术动态|活动信息|学术交流|教育活动|公开课|工作坊|活动日程|日程安排|展讯|展览|演出|排期|what'?s on|events?|activities)/i;
const COLUMN_HREF =
  /\/(jz|xsjz|xsbg|jzbg|xshd|jzxx|xsxx|hdyc|jzrz|whhd|xxhd|xsfw|xsjl|xshy|kyjz|cme|edu|train|meeting|conference|activities|events|activity|lecture|seminar|programme|calendar|whatson|exhibition)/i;

function stripTags(text = "") {
  return String(text)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function mapLimit(items, limit, mapper) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) out.push(...(await Promise.all(items.slice(i, i + limit).map(mapper))));
  return out;
}

async function findColumns(seed) {
  try {
    const html = await defaultFetchHtml(seed.url);
    const found = new Map();
    for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
      const label = stripTags(match[2]);
      let url;
      try {
        url = new URL(match[1], seed.url).href;
      } catch {
        continue;
      }
      if (new URL(url).hostname !== new URL(seed.url).hostname) continue;
      if (!COLUMN_TEXT.test(label) && !COLUMN_HREF.test(url)) continue;
      const score = (COLUMN_TEXT.test(label) ? 2 : 0) + (COLUMN_HREF.test(url) ? 2 : 0);
      if (!found.has(url)) found.set(url, { label: label.slice(0, 30), score });
    }
    return [...found.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 5)
      .map(([url, meta]) => ({ school: seed.name, url, ...meta }));
  } catch {
    return [];
  }
}

async function verify(column) {
  const source = { name: column.url, url: column.url, category: "高校讲座", tier: "T2" };
  try {
    const html = await defaultFetchHtml(column.url);
    const events = filterPublishableEvents(await PARSERS[parserKey](html, source, { fetchHtml: defaultFetchHtml }));
    const win = events.filter((event) => isInDateRange(event, startDate, endDate)).length;
    const latest = events.map((e) => e.start_time.slice(0, 10)).sort().reverse()[0] || "-";
    return { ...column, total: events.length, win, latest };
  } catch (error) {
    return { ...column, total: 0, win: 0, latest: "ERR" };
  }
}

const perSeed = await mapLimit(seeds, 8, findColumns);
const columns = perSeed.flat();
console.error(`找到 ${columns.length} 个候选栏目，实测中…\n`);

const verified = await mapLimit(columns, 6, verify);
const good = verified.filter((item) => item.total > 0).sort((a, b) => b.win - a.win || String(b.latest).localeCompare(String(a.latest)));

console.error("窗口内 总条数 最近日期     机构 | 栏目标题 | URL");
for (const row of good) {
  console.error(
    `${String(row.win).padStart(5)} ${String(row.total).padStart(6)}  ${String(row.latest).padEnd(11)} ${row.school} | ${row.label} | ${row.url}`,
  );
}
process.stdout.write(JSON.stringify(good, null, 1));
