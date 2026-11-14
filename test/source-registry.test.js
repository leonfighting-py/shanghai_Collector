import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

import { LAND_SOURCES, OFFSHORE_SOURCES, SOURCE_SEEDS, SOURCE_SEEDS_RAW, resolveSourceTier } from "../src/lib/collector.js";
import { PARSERS } from "../src/lib/parsers/index.js";
import { STATIC_SEEDS_WITH_ORDER } from "../src/lib/sources/index.js";
import { RETIRED_SOURCE_NAMES } from "../src/lib/sources/retired.js";

const SNAPSHOT_URL = new URL("./fixtures/source-registry.snapshot.json", import.meta.url);

// 在 PARSERS 里反查函数引用，得到解析器名（快照存名字而不是函数，diff 才可读）
const parserEntries = Object.entries(PARSERS);
function parserName(parser) {
  const hit = parserEntries.find(([, fn]) => fn === parser);
  return hit ? hit[0] : null;
}

// 快照覆盖**全部字段**和**全部条目（含已停采）**：
//   · defaultVenue 决定活动的场馆，进而决定去重键（标题|日期|场馆）——只比对几个固定字段的话，
//     以后改信源时误删它，快照测试是发现不了的；
//   · 已停采条目的 URL / parser 也要守住，否则「复活」时拿到的是被改坏的配置。
// 函数字段（parser）换成名字；派生出的 tier / 是否停采一并记录。
// 前几个键固定顺序，其余按字母排序，快照 diff 好读。
const LEADING_KEYS = ["name", "url", "category", "locale", "parserName", "tier", "retired"];
function toRow(source) {
  const { parser, ...rest } = source;
  const derived = {
    name: source.name,
    url: source.url,
    category: source.category,
    locale: source.locale,
    parserName: parserName(parser),
    tier: resolveSourceTier(source),
    retired: RETIRED_SOURCE_NAMES.has(source.name),
  };
  const row = {};
  for (const key of LEADING_KEYS) row[key] = derived[key];
  for (const key of Object.keys(rest).sort()) {
    if (!(key in row)) row[key] = rest[key];
  }
  return row;
}

function currentRows() {
  return SOURCE_SEEDS_RAW.map(toRow);
}

// 快照测试（WP1）：信源注册表从 collector.js 拆到 src/lib/sources/ 时的行为不变护栏。
// 有意改信源（增/删/改配置/停采）后，用下面的命令重写快照，再在 diff 里确认改动符合预期：
//   UPDATE_SNAPSHOT=1 node --test test/source-registry.test.js
// 快照比对的是**有序**数组：顺序决定同键合并时谁当底，顺序变了也算变更。
test("信源注册表快照：全部字段、全部条目、顺序都必须一致（有意变更请更新快照文件）", () => {
  const rows = currentRows();
  if (process.env.UPDATE_SNAPSHOT === "1") {
    writeFileSync(SNAPSHOT_URL, `${JSON.stringify(rows, null, 2)}\n`);
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8"));
  assert.deepEqual(rows, snapshot);
});

// 动态条目由环境变量生成（公众号 / X 时间线），测试环境不应带出来，否则快照会随机器变化
test("测试环境下没有动态信源混进快照", () => {
  assert.equal(SOURCE_SEEDS_RAW.length, STATIC_SEEDS_WITH_ORDER.length);
});

// order 是还原顺序的唯一依据：重号时排序结果取决于文件拼接顺序，等于顺序没被守住
test("静态信源的 order 是整数且不重号", () => {
  const seen = new Map();
  const problems = [];
  for (const source of STATIC_SEEDS_WITH_ORDER) {
    if (!Number.isInteger(source.order)) problems.push(`${source.name}: order=${source.order}`);
    else if (seen.has(source.order)) problems.push(`order ${source.order}: ${seen.get(source.order)} / ${source.name}`);
    else seen.set(source.order, source.name);
  }
  assert.deepEqual(problems, []);
});

// order 只在 sources/index.js 内部用来排序，不应漏到下游的信源对象上
test("导出的信源对象不带 order 字段", () => {
  assert.equal(SOURCE_SEEDS_RAW.filter((source) => "order" in source).length, 0);
});

// 不变量 1：信源名不重复。
// 名字重复会让 source_configs 的 upsert（source_name 唯一键）互相覆盖、停采清单一次停掉多条、
// 告警的连续失败统计把不同站点的失败算到一起。2026-11 已清掉历史上的 4 组重名
// （东华 / 上理工按子域名加后缀，海事 http/https 重复条目已删），从此不留例外。
test("信源名不重复", () => {
  const counts = new Map();
  for (const source of SOURCE_SEEDS_RAW) {
    counts.set(source.name, (counts.get(source.name) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => `${name} ×${count}`);
  assert.deepEqual(duplicates, []);
});

// 同一页面只采一次：只差 http/https 的两条会让同一批活动每轮被抓两遍（海事讲座信息曾经如此）
test("信源 URL 不重复（忽略 http/https 差异）", () => {
  const seen = new Map();
  const duplicates = [];
  for (const source of SOURCE_SEEDS_RAW) {
    const key = String(source.url).replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (seen.has(key)) duplicates.push(`${seen.get(key)} / ${source.name}`);
    else seen.set(key, source.name);
  }
  assert.deepEqual(duplicates, []);
});

// 不变量 2：停采清单里的每个名字都能在原始表里找到——防止改名/删除条目后停采静默失效
// （名字对不上 = 这个源复活了但没人知道）。停采是可逆配置，复活必须是有意为之。
test("停采清单里的名字都能在原始表里找到", () => {
  const rawNames = new Set(SOURCE_SEEDS_RAW.map((source) => source.name));
  const missing = [...RETIRED_SOURCE_NAMES].filter((name) => !rawNames.has(name));
  assert.deepEqual(missing, []);
});

// 衍生集合的一致性：停采过滤 + 境内外分组
test("衍生集合口径：SEEDS = RAW 去停采，LAND + OFFSHORE = SEEDS", () => {
  const active = SOURCE_SEEDS_RAW.filter((source) => !RETIRED_SOURCE_NAMES.has(source.name));
  assert.equal(SOURCE_SEEDS.length, active.length);
  assert.equal(LAND_SOURCES.length + OFFSHORE_SOURCES.length, SOURCE_SEEDS.length);
  for (const source of OFFSHORE_SOURCES) assert.equal(source.offshore, true);
});
