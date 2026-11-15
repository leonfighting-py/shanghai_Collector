// 字段补齐覆盖率：把 docs/plans/2026-10-12-event-facets-backfill.md 第 2 节那张基线表
// 换成今天的数字，并给出各字段覆盖率与各层贡献。
//
// 用法：npm run facets:coverage
//
// 口径与线上一致：走 listEvents（同一个读窗口），派生字段由 filterPublishableEvents 算。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectDistrict, DISTRICTS } from "../src/lib/event-classify.js";
import { listEvents } from "../src/lib/repository.js";
import { matchVenue } from "../src/lib/venue-profiles.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(root, "scripts/facets-coverage-report.md");

// 方案第 2 节的基线（2026-10-12 线上库，窗口内 119 条）
const BASELINE = {
  date: "2026-10-12",
  total: 119,
  vagueVenue: 39,
  venueWithDistrict: 10,
  titleHasPrice: 1,
  titleHasFree: 2,
  titleHasKids: 6,
  distinctVenues: 66,
};

const VAGUE = new Set(["", "上海", "上海市"]);
const DISTRICT_IN_VENUE = /(黄浦|徐汇|长宁|静安|普陀|虹口|杨浦|浦东|闵行|宝山|嘉定|松江|青浦|奉贤|金山|崇明)/;
const PRICE_WORDS = /[¥￥]\s*\d|\d+\s*元|票价|免费/;
const FREE_WORDS = /免费|免票|无需门票/;
const KIDS_WORDS = /亲子|儿童|少儿|小朋友|绘本/;

function pct(part, total) {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%（${part}/${total}）`;
}

function countBy(items, pick) {
  const counts = new Map();
  for (const item of items) {
    const key = pick(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function districtSource(event) {
  const stored = String(event.district || "").trim();
  if (!stored) return "未识别";
  if (event.facet_provenance?.district === "llm") return "llm";
  if (matchVenue(event.venue)) return "venue_dict";
  if (detectDistrict(event) === stored) return "rule";
  return "unknown";
}

async function main() {
  const events = await listEvents({});
  const total = events.length;

  const vagueVenue = events.filter((event) => VAGUE.has(String(event.venue || "").trim())).length;
  const venueWithDistrict = events.filter((event) => DISTRICT_IN_VENUE.test(String(event.venue || ""))).length;
  const titleText = (event) => `${event.title || ""} ${event.summary || ""}`;
  const titleHasPrice = events.filter((event) => PRICE_WORDS.test(titleText(event))).length;
  const titleHasFree = events.filter((event) => FREE_WORDS.test(titleText(event))).length;
  const titleHasKids = events.filter((event) => KIDS_WORDS.test(titleText(event))).length;
  const distinctVenues = new Set(events.map((event) => String(event.venue || "").trim()).filter(Boolean)).size;

  const hasAddress = events.filter((event) => event.address).length;
  const hasPrice = events.filter((event) => event.price_min !== null || event.price_max !== null).length;
  const hasFree = events.filter((event) => event.is_free !== null && event.is_free !== undefined).length;
  const freeTrue = events.filter((event) => event.is_free === true).length;
  const hasAudience = events.filter((event) => (event.audience || []).length > 0).length;
  const hasDistrict = events.filter((event) => event.district).length;

  const lines = [
    "# 字段补齐覆盖率报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    `口径：线上读窗口（当天起 14 天），共 ${total} 条`,
    "",
    "## 方案第 2 节基线对比",
    "",
    `| 指标 | ${BASELINE.date} 基线（${BASELINE.total} 条） | 现在（${total} 条） |`,
    "|---|---|---|",
    `| 场馆只写「上海」或空 | ${BASELINE.vagueVenue}（33%） | **${vagueVenue}（${Math.round((vagueVenue / total) * 100)}%）** |`,
    `| 场馆名里带区名 | ${BASELINE.venueWithDistrict} | ${venueWithDistrict} |`,
    `| 标题或摘要提到价格 | ${BASELINE.titleHasPrice} | ${titleHasPrice} |`,
    `| 标题或摘要提到免费 | ${BASELINE.titleHasFree} | ${titleHasFree} |`,
    `| 标题或摘要提到亲子 / 儿童类词 | ${BASELINE.titleHasKids} | ${titleHasKids} |`,
    `| 不同场馆名 | ${BASELINE.distinctVenues} | ${distinctVenues} |`,
    "",
    "## 字段覆盖率",
    "",
    "| 字段 | 覆盖率 | 目标 | 决策点② |",
    "|---|---|---|---|",
    `| 区域 district | ${pct(hasDistrict, total)} | >80% | 低于 60% → 第 11 天先补场馆字典 |`,
    `| 地址 address | ${pct(hasAddress, total)} | — | |`,
    `| 票价 price_min/max | ${pct(hasPrice, total)} | 演出音乐 >50% | 低于 20% → 第 13 天去掉「免费」卡 |`,
    `| 是否免费 is_free | ${pct(hasFree, total)}（其中免费 ${freeTrue}） | — | |`,
    `| 人群 audience | ${pct(hasAudience, total)} | 不设目标 | |`,
    "",
    "## 各层贡献",
    "",
    "按 `facet_provenance` 统计；区域是派生字段，按「存值来自 LLM / 场馆字典命中 / 规则 / 未识别」拆开。",
    "",
    "| 层 | 地址 | 票价 | 是否免费 | 人群 |",
    "|---|---|---|---|---|",
  ];

  const provenanceOf = (field) => (event) => event.facet_provenance?.[field] || "（未记来源）";
  const layers = ["detail", "llm", "rule", "parser"];
  const rows = layers.map((layer) => {
    const count = (field) =>
      events.filter((event) => event.facet_provenance?.[field] === layer).length;
    return `| ${layer} | ${count("address")} | ${count("price")} | ${count("is_free")} | ${count("audience")} |`;
  });
  lines.push(...rows);

  const districtRows = countBy(events, districtSource);
  lines.push(
    "",
    "### 区域来源",
    "",
    "| 来源 | 条数 |",
    "|---|---|",
    ...districtRows.map(([key, count]) => `| ${key} | ${count} |`),
    "",
    "### 区域分布",
    "",
    "| 区 | 条数 |",
    "|---|---|",
    ...countBy(events, (event) => event.district || "未识别").map(([key, count]) => `| ${key} | ${count} |`),
    "",
    "### 人群标签分布",
    "",
    "| 标签 | 条数 |",
    "|---|---|",
    ...[...countBy(events.flatMap((event) => event.audience || []).map((label) => ({ label })), (item) => item.label)]
      .map(([key, count]) => `| ${key} | ${count} |`),
    "",
  );

  // 有地址的按区名再判一次，作为区域准确性的粗校验
  const addressDistrict = events.filter((event) => event.address && DISTRICT_IN_VENUE.test(event.address)).length;
  lines.push(
    "## 交叉校验",
    "",
    `- 有地址且地址里能看出区名：${addressDistrict} 条`,
    `- 区域与地址冲突的条数：${events.filter((event) => event.district && event.address && !event.address.includes(event.district)).length} 条（区名写法可能是「浦东新区」，不一定真是冲突，需人工看）`,
    "",
    "## 怎么用",
    "",
    "- 区域低于 60%：按决策点②先补场馆字典，加信源顺延半天。",
    "- 票价低于 20%：第 13 天的场景入口去掉「免费」卡，等数据。",
    "- 采集总时长超过 45 分钟：看 `collection_runs` 里最近几轮的 `stage_timings.detail_facets_ms` 与缓存命中率。",
    "",
  );

  fs.writeFileSync(REPORT, lines.join("\n"));
  console.log(lines.slice(0, 40).join("\n"));
  console.log(`\n完整报告：${path.relative(root, REPORT)}`);
  console.log(`区域 ${hasDistrict}/${total}（${Math.round((hasDistrict / total) * 100)}%）｜地址 ${hasAddress}｜票价 ${hasPrice}｜免费 ${hasFree}｜人群 ${hasAudience}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
