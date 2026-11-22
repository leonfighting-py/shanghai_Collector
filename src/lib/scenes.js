// 场景入口：把「今晚」「这个周末」「免费」「雨天室内」「带娃」五个问题落成筛选谓词。
//
// 纯函数，不碰网络也不读库。两个约定：
//   1. 时间一律按上海时区算（shanghai-time.js），runner 的本地时区可能是 UTC；
//   2. 「雨天室内」依赖事件上的 `indoor` / `inDictionary` —— 这两个字段由服务端用场馆字典
//      预先标注（page.js 调 venue-profiles），不把整个字典打进浏览器包。

import { toShanghaiDate } from "./events.js";
import { shanghaiDay, shanghaiHour, shiftShanghaiDate } from "./shanghai-time.js";

/** 顺序即首页展示顺序 */
export const SCENES = [
  { key: "tonight", label: "今晚" },
  { key: "weekend", label: "这个周末" },
  { key: "free", label: "免费" },
  { key: "indoor", label: "雨天室内" },
  { key: "kids", label: "带娃" },
];

/** 少于这个条数的场景不显示卡片：放个点进去只有一条的空入口，比没有更糟 */
export const SCENE_MIN_COUNT = 3;

export const SCENE_KEYS = SCENES.map((scene) => scene.key);

export function sceneLabel(key) {
  return SCENES.find((scene) => scene.key === key)?.label || "";
}

/**
 * 「这个周末」对应的日期。
 *   · 周六：今天 + 明天
 *   · 周日：只有今天（昨天已经过去，不再列）
 *   · 周一到周五：本周六 + 本周日
 */
export function weekendDates(now = new Date()) {
  const today = toShanghaiDate(now);
  const day = shanghaiDay(now);
  if (day === 6) return [today, shiftShanghaiDate(today, 1)];
  if (day === 0) return [today];
  const toSaturday = 6 - day;
  return [shiftShanghaiDate(today, toSaturday), shiftShanghaiDate(today, toSaturday + 1)];
}

/**
 * 一条活动是否属于某个场景。
 *
 * 「今晚」只看**开始时间**：18:00 之后开始、且开始日期是上海今天。
 * 正在进行的长期展览不算 —— 它天天都在，不构成「今晚去哪」的答案。
 */
export function matchesScene(event, key, now = new Date()) {
  if (!key) return true;
  switch (key) {
    case "tonight": {
      const start = event?.start_time;
      if (!start) return false;
      return toShanghaiDate(start) === toShanghaiDate(now) && shanghaiHour(start) >= 18;
    }
    case "weekend": {
      const start = event?.start_time;
      if (!start) return false;
      return weekendDates(now).includes(toShanghaiDate(start));
    }
    case "free":
      // 只认明确标了免费的活动；is_free 为 null 表示「不知道」，不等于免费
      return event?.is_free === true;
    case "indoor":
      // 场馆字典说室内，或者本身是展览且场馆在字典里（展览多在室内，但户外装置展不算）
      return event?.indoor === true || (event?.category === "展览" && event?.inDictionary === true);
    case "kids":
      return Array.isArray(event?.audience) && event.audience.includes("亲子");
    default:
      return true;
  }
}

export function filterByScene(events, key, now = new Date()) {
  if (!key) return events;
  return events.filter((event) => matchesScene(event, key, now));
}

/** 各场景的条数（含不足 3 条的，便于调试与埋点） */
export function sceneCounts(events, now = new Date()) {
  return SCENES.map((scene) => ({
    ...scene,
    count: events.filter((event) => matchesScene(event, scene.key, now)).length,
  }));
}

/** 首页只展示够数的场景：空入口点了没东西，比不展示更差 */
export function availableScenes(events, now = new Date(), minCount = SCENE_MIN_COUNT) {
  return sceneCounts(events, now).filter((scene) => scene.count >= minCount);
}
