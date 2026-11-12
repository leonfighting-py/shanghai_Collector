import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LAND_SOURCES, OFFSHORE_SOURCES, SOURCE_SEEDS, SOURCE_SEEDS_RAW } from "../src/lib/collector.js";
import { PARSERS } from "../src/lib/parsers/index.js";
import { RETIRED_SOURCE_NAMES } from "../src/lib/sources/retired.js";

// 在 PARSERS 里反查函数引用，得到解析器名（快照存名字而不是函数，diff 才可读）
const parserEntries = Object.entries(PARSERS);
function parserName(parser) {
  const hit = parserEntries.find(([, fn]) => fn === parser);
  return hit ? hit[0] : null;
}

function currentRows() {
  return SOURCE_SEEDS.map((source) => ({
    name: source.name,
    url: source.url,
    category: source.category,
    locale: source.locale,
    tier: source.tier,
    offshore: Boolean(source.offshore),
    parserName: parserName(source.parser),
  }));
}

// 快照测试（WP1）：信源注册表从 collector.js 拆到 src/lib/sources/ 时的行为不变护栏。
// 改信源（增/删/改配置/停采）时更新快照，diff 一眼能看出改了什么。
test("信源注册表快照：拆分/修改前后必须一字不差（有意变更请更新快照文件）", () => {
  const snapshot = JSON.parse(
    readFileSync(new URL("./fixtures/source-registry.snapshot.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(currentRows(), snapshot);
});

// 不变量 1：信源名不重复。
// ⚠️ 历史上已有 4 组例外：同校不同院系的不同站点共用显示名（如「东华·通知公告」
// 覆盖 5 个院系站点）。名字重复会让 source_configs 的 upsert 和告警的连续失败统计
// 按名去重时互相覆盖，所以不让新增；已有的 4 组是既成事实，列在下面防回归扩大。
const KNOWN_DUPLICATE_NAMES = new Set([
  "东华·通知公告",
  "上理工·通知公告",
  "上理工双创·通知公告",
  "上海海事大学·讲座信息",
]);

test("信源名不重复（已知例外之外不得新增重名）", () => {
  const counts = new Map();
  for (const source of SOURCE_SEEDS_RAW) {
    counts.set(source.name, (counts.get(source.name) || 0) + 1);
  }
  const newDuplicates = [...counts.entries()]
    .filter(([name, count]) => count > 1 && !KNOWN_DUPLICATE_NAMES.has(name))
    .map(([name, count]) => `${name} ×${count}`);
  assert.deepEqual(newDuplicates, []);
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
