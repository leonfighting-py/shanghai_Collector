import test from "node:test";
import assert from "node:assert/strict";

import { DISTRICT_TILES, buildDistrictMap, districtCounts, heatLevel } from "../src/lib/district-map.js";
import { DISTRICTS } from "../src/lib/event-classify.js";

test("示意图刚好覆盖 16 个区，不重不漏", () => {
  const names = DISTRICT_TILES.map((tile) => tile.name).sort();
  assert.deepEqual(names, [...DISTRICTS].sort());
  assert.equal(new Set(names).size, 16);
});

test("方块不重叠（浦东跨两行两列，单独算）", () => {
  const rects = DISTRICT_TILES.map((tile) => ({
    name: tile.name,
    x: tile.x,
    y: tile.y,
    w: tile.w ?? 15,
    h: tile.h ?? 13.5,
  }));
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${a.name} 与 ${b.name} 重叠`);
    }
  }
});

test("方块不超出 viewBox", () => {
  for (const tile of DISTRICT_TILES) {
    const w = tile.w ?? 15;
    const h = tile.h ?? 13.5;
    assert.ok(tile.x >= 0 && tile.y >= 0, `${tile.name} 坐标为负`);
    assert.ok(tile.x + w <= 100, `${tile.name} 右侧出界`);
    assert.ok(tile.y + h <= 61, `${tile.name} 底部出界`);
  }
});

test("按区计数：16 区都置零，未标注单独计", () => {
  const { counts, max, unknown } = districtCounts([
    { district: "黄浦" },
    { district: "黄浦" },
    { district: "浦东" },
    { district: "" },
    { district: "苏州" },
  ]);

  assert.equal(counts["黄浦"], 2);
  assert.equal(counts["浦东"], 1);
  assert.equal(counts["崇明"], 0, "没出现的区也要有 0，否则渲染要判 undefined");
  assert.equal(max, 2);
  assert.equal(unknown, 2, "空 district 与名单外的值都算未标注");
});

test("色阶：按当前最大值取相对档位", () => {
  assert.equal(heatLevel(0, 10), 0);
  assert.equal(heatLevel(1, 10), 1);
  assert.equal(heatLevel(2, 10), 1, "2/10=0.2 < 0.25");
  assert.equal(heatLevel(3, 10), 2, "3/10=0.3");
  assert.equal(heatLevel(5, 10), 3, "0.5 进 3 档");
  assert.equal(heatLevel(8, 10), 4, "0.8 进 4 档");
  assert.equal(heatLevel(10, 10), 4);
  assert.equal(heatLevel(5, 0), 0, "全为 0 时不除零");
});

test("buildDistrictMap 把 count 与 level 一起给渲染层", () => {
  const map = buildDistrictMap([
    { district: "黄浦" },
    { district: "黄浦" },
    { district: "黄浦" },
    { district: "浦东" },
  ]);

  const huangpu = map.tiles.find((tile) => tile.name === "黄浦");
  const pudong = map.tiles.find((tile) => tile.name === "浦东");
  assert.equal(huangpu.count, 3);
  assert.equal(huangpu.level, 4, "最大值自己就是第 4 档");
  assert.equal(pudong.count, 1);
  assert.ok(pudong.level >= 1);
  assert.equal(map.max, 3);
  assert.equal(map.total, 4);
});
