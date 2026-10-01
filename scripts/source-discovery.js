// 院系级讲座栏目挖掘（只读）：
// 1) 从高校"院系设置"页拿到各院系站点地址
// 2) 逐个抓取院系主页，找出标题像"讲座/学术活动/报告/论坛"的栏目链接
// 3) 对每个候选栏目用 cnCmsLectures 实测，输出能抽出条目的栏目清单
import { readFileSync } from "node:fs";
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { parseCnCmsLectures } from "../src/lib/parsers/cn-cms-lectures.js";
import { filterPublishableEvents, isInDateRange, toShanghaiDayWindow } from "../src/lib/events.js";

// 院校清单可由第二个参数传入 JSON 文件，便于按批扩展挖掘范围
const SEEDS = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : {
      复旦大学: "https://www.fudan.edu.cn/",
      上海交通大学: "https://www.sjtu.edu.cn/",
      同济大学: "https://www.tongji.edu.cn/",
      华东师范大学: "https://www.ecnu.edu.cn/",
      华东理工大学: "https://www.ecust.edu.cn/",
      东华大学: "https://www.dhu.edu.cn/",
      上海财经大学: "https://www.sufe.edu.cn/",
      上海外国语大学: "https://www.shisu.edu.cn/",
      上海大学: "https://www.shu.edu.cn/",
      上海理工大学: "https://www.usst.edu.cn/",
      华东政法大学: "https://www.ecupl.edu.cn/",
    };

// 院系站点域名徽标由 SEEDS 自动推导，扩院校时无需改正则
const SITE_BADGE = [
  ...new Set(
    Object.values(SEEDS)
      .map((url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .map((host) => host.replace(/^www\./, "").split(".")[0]),
  ),
];
const DEPT_LINK_RE = new RegExp(
  `<a[^>]+href=["']((?:https?://)?(?:[\\w-]+\\.)*(?:${SITE_BADGE.join("|")})\\.edu\\.cn[^"']*)["'][^>]*>([\\s\\S]{0,80}?)</a>`,
  "gi",
);
const COLUMN_TEXT = /(讲座|学术活动|学术报告|报告会|活动预告|学术星空|讲坛|论坛|沙龙|学术前沿|学术动态)/;
const COLUMN_HREF = /\/(jz|xsjz|xsbg|jzbg|xshd|xshd|jzxx|xsxx|hdyc|jzrz|whhd|xxhd|xsfw|activities|events|activity|lecture|seminar)/i;

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
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(mapper))));
  }
  return out;
}

async function collectDepartments([school, homeUrl]) {
  try {
    const html = await defaultFetchHtml(homeUrl);
    const depts = new Map();
    for (const match of html.matchAll(DEPT_LINK_RE)) {
      let url;
      try {
        url = new URL(match[1], homeUrl).href;
      } catch {
        continue;
      }
      const host = new URL(url).hostname;
      if (!SITE_BADGE.some((badge) => host.includes(badge))) continue;
      if (/news|library|mail|vpn|job|zf|xxgk|xgb|jwc|yjsy|kjc|cwc|rsc|hq|gjjl|alumni|foundation/i.test(url)) continue;
      const key = new URL(url).origin + new URL(url).pathname.replace(/\/$/, "");
      if (!depts.has(key)) depts.set(key, url);
    }
    return { school, homeUrl, depts: [...depts.values()].slice(0, 45) };
  } catch (error) {
    return { school, homeUrl, depts: [], error: error.message };
  }
}

async function findColumns(deptUrl, school) {
  try {
    const html = await defaultFetchHtml(deptUrl);
    const found = new Map();
    for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
      const label = stripTags(match[2]);
      let url;
      try {
        url = new URL(match[1], deptUrl).href;
      } catch {
        continue;
      }
      if (new URL(url).hostname !== new URL(deptUrl).hostname) continue;
      if (!COLUMN_TEXT.test(label) && !COLUMN_HREF.test(url)) continue;
      const score = (COLUMN_TEXT.test(label) ? 2 : 0) + (COLUMN_HREF.test(url) ? 2 : 0);
      if (!found.has(url)) found.set(url, { label: label.slice(0, 30), score });
    }
    return [...found.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 4)
      .map(([url, meta]) => ({ school, dept: deptUrl, url, ...meta }));
  } catch {
    return [];
  }
}

async function verifyColumn(column) {
  const source = { name: column.url, url: column.url, category: "高校讲座", tier: "T2" };
  try {
    const html = await defaultFetchHtml(column.url);
    const events = await parseCnCmsLectures(html, source, { fetchHtml: defaultFetchHtml });
    const pub = filterPublishableEvents(events);
    const { startDate, endDate } = toShanghaiDayWindow(new Date());
    const inWindow = pub.filter((event) => isInDateRange(event, startDate, endDate)).length;
    const latest = pub.map((event) => event.start_time.slice(0, 10)).sort().reverse()[0] || "-";
    return { ...column, total: pub.length, inWindow, latest };
  } catch (error) {
    return { ...column, total: 0, inWindow: 0, latest: "ERR", error: error.message.slice(0, 40) };
  }
}

const schools = await mapLimit(Object.entries(SEEDS), 6, ([school, homeUrl]) => collectDepartments([school, homeUrl]));
for (const school of schools) {
  console.error(`${school.school}: ${school.depts.length} 个院系站点${school.error ? " ERR " + school.error : ""}`);
}

const allColumns = [];
for (const school of schools) {
  const perDept = await mapLimit(school.depts, 8, (dept) => findColumns(dept, school.school));
  allColumns.push(...perDept.flat());
}
console.error(`\n候选栏目 ${allColumns.length} 个，开始实测…\n`);

const verified = await mapLimit(allColumns, 6, verifyColumn);
const good = verified
  .filter((item) => item.total > 0)
  .sort((a, b) => b.inWindow - a.inWindow || String(b.latest).localeCompare(String(a.latest)));

console.error("窗口内 总条数 最近日期     院系栏目");
for (const row of good) {
  console.error(
    `${String(row.inWindow).padStart(5)} ${String(row.total).padStart(6)}  ${String(row.latest).padEnd(11)} ${row.school} | ${row.label} | ${row.url}`,
  );
}
process.stdout.write(JSON.stringify(good, null, 1));
