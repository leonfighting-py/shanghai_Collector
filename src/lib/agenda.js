// 日程表视图模型：把「一条活动占一个日期区间」摊到未来两周的每一天。
//
// 背景：旧首页按类目平铺卡片，一档 10.14–10.30 的展览只会挂在开始那天，
// 之后的日子里就看不到它了。日程表要求每一天都能回答「今天能去什么」，
// 所以一条跨天活动在它的整个区间内都算数，只是呈现方式不同：
//   - start：当天开始（跨天的标「首日」）
//   - last ：当天是最后一天
//   - run  ：展期中（已开始、未结束）—— 数量很大（线上常年 60+ 场长档期展览），
//            每天只挑几条露出，其余折叠
//
// ⚠️ miniprogram/utils/agenda.js 是本文件的 CommonJS 移植（小程序不能引用 src/），
//    改这里的规则时两边要一起改。

import { toShanghaiDate } from "./events.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 每天至少露出的行数：当天开始/结束的不够时，用展期中的活动补足 */
export const AGENDA_MIN_ROWS = 5;
/** 剩余天数不超过这个值的展期中活动优先露出（快结束了，值得提醒） */
const ENDING_SOON_DAYS = 3;

export function eventStartDay(event) {
  return toShanghaiDate(event.start_time);
}

/** 结束日：没有 end_time 或 end_time 不晚于开始日的，一律按单日活动处理 */
export function eventEndDay(event) {
  const start = eventStartDay(event);
  const end = toShanghaiDate(event.end_time);
  return end && end > start ? end : start;
}

export function isMultiDay(event) {
  return eventEndDay(event) > eventStartDay(event);
}

/** 两个 YYYY-MM-DD 之间相差的整天数（to - from） */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function spanDays(event) {
  return daysBetween(eventStartDay(event), eventEndDay(event)) + 1;
}

export function listWindowDays(startDate, count) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

/** "2026-10-04" → "10.04" */
export function formatDotDate(date) {
  return String(date || "").slice(5).replace("-", ".");
}

/** ISO 时间 → 上海时区的 "HH:MM" */
export function formatShanghaiClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

/** 跨天活动的区间文案："10.10 — 10.17 · 共 8 天"；单日活动返回空串 */
export function formatRange(event) {
  if (!isMultiDay(event)) return "";
  return `${formatDotDate(eventStartDay(event))} — ${formatDotDate(eventEndDay(event))} · 共 ${spanDays(event)} 天`;
}

function byStartTime(left, right) {
  return new Date(left.start_time).getTime() - new Date(right.start_time).getTime();
}

function hasImage(event) {
  return typeof event.image_url === "string" && /^https?:\/\//i.test(event.image_url.trim());
}

/**
 * 以 today 为界拆成两组：
 *   ongoing  —— 今天之前就开始、今天仍未结束（「正在进行」海报栏）
 *   upcoming —— 今天及之后才开始
 */
export function splitByToday(events, today) {
  const ongoing = [];
  const upcoming = [];
  for (const event of events) {
    const start = eventStartDay(event);
    if (!start) continue;
    if (start >= today) upcoming.push(event);
    else if (eventEndDay(event) >= today) ongoing.push(event);
  }
  upcoming.sort(byStartTime);
  // 有封面的排前面：海报栏是纯视觉入口
  ongoing.sort((left, right) => Number(hasImage(right)) - Number(hasImage(left)) || byStartTime(left, right));
  return { ongoing, upcoming };
}

/**
 * 从展期中的活动里挑 need 条直接露出，其余折叠。
 * 先放快结束的；剩下的按 dayIndex 轮换起点，避免连续几天露出的都是同一批。
 */
export function featureRunning(running, date, need, dayIndex = 0) {
  if (need <= 0 || running.length === 0) return { featured: [], folded: running };
  const soon = [];
  const rest = [];
  for (const event of running) {
    (daysBetween(date, eventEndDay(event)) <= ENDING_SOON_DAYS ? soon : rest).push(event);
  }
  rest.sort((left, right) => Number(hasImage(right)) - Number(hasImage(left)));
  const shift = rest.length ? (dayIndex * need) % rest.length : 0;
  const featured = [...soon, ...rest.slice(shift), ...rest.slice(0, shift)].slice(0, need);
  const picked = new Set(featured);
  return { featured, folded: running.filter((event) => !picked.has(event)) };
}

/**
 * 构建日程表：返回窗口内每一天的分桶结果（没有任何活动的日子也会返回，rows 为空）。
 *
 * @returns {Array<{
 *   date: string, day: string, month: number, weekday: string,
 *   isToday: boolean, isWeekend: boolean,
 *   rows: Array<{ event: object, kind: "start" | "last" | "run" }>,
 *   folded: object[], startCount: number, endCount: number, runningCount: number
 * }>}
 */
export function buildAgenda(events, { today, days = 14, minRows = AGENDA_MIN_ROWS } = {}) {
  return listWindowDays(today, days).map((date, dayIndex) => {
    const starts = [];
    const ends = [];
    const running = [];
    for (const event of events) {
      const start = eventStartDay(event);
      if (!start) continue;
      const end = eventEndDay(event);
      if (start === date) starts.push(event);
      else if (end === date && start < date) ends.push(event);
      else if (start < date && end > date) running.push(event);
    }
    starts.sort(byStartTime);
    running.sort((left, right) => eventEndDay(left).localeCompare(eventEndDay(right)));

    const { featured, folded } = featureRunning(running, date, minRows - starts.length - ends.length, dayIndex);
    const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();

    return {
      date,
      day: date.slice(8),
      month: Number(date.slice(5, 7)),
      weekday: WEEKDAYS[weekdayIndex],
      isToday: date === today,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
      rows: [
        ...starts.map((event) => ({ event, kind: "start" })),
        ...ends.map((event) => ({ event, kind: "last" })),
        ...featured.map((event) => ({ event, kind: "run" })),
      ],
      folded,
      startCount: starts.length,
      endCount: ends.length,
      runningCount: running.length,
    };
  });
}

/**
 * 「本期推荐」：从已按推荐分排好序的活动里挑 limit 条。
 * 只要还没结束的、有封面的；先保证类目不重复，不够再按原顺序补。
 */
export function pickHighlights(rankedEvents, { today, limit = 3 } = {}) {
  const candidates = rankedEvents.filter((event) => hasImage(event) && eventEndDay(event) >= today);
  const picked = [];
  const seenCategories = new Set();
  for (const event of candidates) {
    if (seenCategories.has(event.category)) continue;
    seenCategories.add(event.category);
    picked.push(event);
  }
  for (const event of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(event)) picked.push(event);
  }
  return picked.slice(0, limit);
}
