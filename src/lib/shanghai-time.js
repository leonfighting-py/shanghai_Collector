// 上海时区的时间判断 —— 「今晚」「这个周末」都依赖它。
// 运行时本地时区可能是 UTC（runner / Workers），直接 getHours() 会把 19:30 的演出算成 11:30。

import { toShanghaiDate } from "./events.js";

export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 上海时区的小时数（0-23，带小数） */
export function shanghaiHour(value) {
  return ((new Date(value).getTime() + SHANGHAI_OFFSET_MS) % 86_400_000) / 3_600_000;
}

/** 上海时区的星期（0=周日）。取上海当日正午，避免边界日期偏移 */
export function shanghaiDay(value) {
  return new Date(`${toShanghaiDate(value)}T12:00:00+08:00`).getUTCDay();
}

/** 在日期字符串上加减天数，返回同样的 YYYY-MM-DD（按上海时区算） */
export function shiftShanghaiDate(date, days) {
  const base = new Date(`${date}T12:00:00+08:00`).getTime();
  return toShanghaiDate(new Date(base + days * 86_400_000));
}
