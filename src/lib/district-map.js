// 区域热度视图的数据层：16 区的简化示意图与色阶。
//
// 不追求真实边界（那要 GeoJSON 与投影，属于第 15 天以后的事），
// 只按大致方位摆成 4 行方块，让人一眼看出「哪一片活动多」。

import { DISTRICTS } from "./event-classify.js";

// 方块坐标：viewBox 0 0 100 61，单块 15×13.5，间距 1.5。
// 行 0 最北（嘉定 / 宝山 / 崇明），行 3 最南（金山 / 闵行 / 徐汇 / 奉贤）。
// 浦东跨两行两列 —— 它的面积和活动密度都压得住这个位置。
export const DISTRICT_TILES = [
  { name: "嘉定", x: 1, y: 1 },
  { name: "宝山", x: 34, y: 1 },
  { name: "崇明", x: 83.5, y: 1 },

  { name: "青浦", x: 1, y: 16 },
  { name: "普陀", x: 34, y: 16 },
  { name: "静安", x: 50.5, y: 16 },
  { name: "虹口", x: 67, y: 16 },
  { name: "杨浦", x: 83.5, y: 16 },

  { name: "松江", x: 1, y: 31 },
  { name: "长宁", x: 34, y: 31 },
  { name: "黄浦", x: 50.5, y: 31 },

  { name: "金山", x: 1, y: 46 },
  { name: "闵行", x: 17.5, y: 46 },
  { name: "徐汇", x: 34, y: 46 },
  { name: "奉贤", x: 50.5, y: 46 },

  // 跨行跨列：w = 2 列 + 中间间距，h = 2 行 + 间距
  { name: "浦东", x: 67, y: 31, w: 31.5, h: 28.5 },
];

/** 单块默认尺寸（浦东除外） */
export const TILE_WIDTH = 15;
export const TILE_HEIGHT = 13.5;
export const MAP_VIEWBOX = "0 0 100 61";

/**
 * 按区统计条数。空 district 归到 `未标注`，不硬塞进任何一个区。
 * @returns {{counts: Record<string, number>, max: number, unknown: number}}
 */
export function districtCounts(events = []) {
  const counts = {};
  for (const name of DISTRICTS) counts[name] = 0;
  let unknown = 0;
  for (const event of events) {
    const district = String(event?.district || "").trim();
    if (district && district in counts) counts[district] += 1;
    else unknown += 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  return { counts, max, unknown };
}

/**
 * 色阶 0-4。0 = 没有活动，4 = 当前最热的那一档。
 * 用相对比例（而不是固定阈值）：不同筛选条件下总量差很大，固定阈值会让整图常年一色。
 */
export function heatLevel(count, max) {
  if (!count || count <= 0) return 0;
  if (!max || max <= 0) return 0;
  const ratio = count / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

/** 给渲染层用：每个方块加上 count 与 level */
export function buildDistrictMap(events = []) {
  const { counts, max, unknown } = districtCounts(events);
  return {
    tiles: DISTRICT_TILES.map((tile) => ({
      ...tile,
      width: tile.w ?? TILE_WIDTH,
      height: tile.h ?? TILE_HEIGHT,
      count: counts[tile.name] || 0,
      level: heatLevel(counts[tile.name] || 0, max),
    })),
    max,
    unknown,
    total: events.length,
  };
}
