// 订阅提醒的排队规则（第 18 天）。
//
// 只算「什么时候提醒」，不碰微信接口、不碰存储 —— 这样能单测，
// 云函数（写库）和第 19 天的定时发送都复用这一份，避免两边算出不同的时间。
//
// 规则（路线图）：普通活动 = 开始前 1 天的 10:00；长档期展览 = 闭展前 3 天的 10:00。

import { eventEndDay, eventStartDay, spanDays } from "./agenda.js";
import { toShanghaiDate } from "./events.js";

/** 提醒时刻固定在上海时间 10:00 */
export const REMIND_HOUR = 10;

/** 跨度达到这个天数的展览算「长档期」，提醒改成闭展前 3 天 */
export const LONG_RUN_MIN_DAYS = 14;
export const LONG_RUN_LEAD_DAYS = 3;

/**
 * 计算该在什么时刻提醒这条活动。
 *
 * @returns {string|null} ISO 时间字符串（上海 10:00）；不该排提醒时返回 null
 *   · 已结束 / 已经错过提醒时刻 → null（不要排一个马上就发、或永远发不出去的）
 *   · 没有 end_time 的多日活动按开始时间算（与 event-duration.js 的补全口径一致）
 */
export function computeRemindAt(event, now = new Date()) {
  const startDay = eventStartDay(event);
  if (!startDay) return null;

  const isLongRun = spanDays(event) >= LONG_RUN_MIN_DAYS;
  const anchorDay = isLongRun ? eventEndDay(event) : startDay;
  const leadDays = isLongRun ? LONG_RUN_LEAD_DAYS : 1;

  const remindAt = shiftDays(anchorDay, -leadDays);
  if (!remindAt) return null;

  // 已经过了提醒时刻就没必要排：一次性订阅只能发一条，排了也发不出去
  if (new Date(remindAt).getTime() <= now.getTime()) return null;

  // 活动本身已经结束（闭展日早于今天）也跳过
  if (eventEndDay(event) < toShanghaiDate(now)) return null;

  return remindAt;
}

/** 日期字符串加减天数，返回上海时间当天 10:00 的 ISO 串 */
function shiftDays(day, delta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
  const base = new Date(`${day}T00:00:00+08:00`).getTime();
  const target = new Date(base + delta * 86_400_000);
  const targetDay = toShanghaiDate(target);
  return `${targetDay}T${String(REMIND_HOUR).padStart(2, "0")}:00:00+08:00`;
}

/** 给 UI 用的一句话，说明这条提醒会在什么时候来 */
export function describeRemind(remindAt) {
  if (!remindAt) return "这场活动已开始或已结束，不再提醒";
  const day = toShanghaiDate(new Date(remindAt));
  const [, month, date] = day.split("-");
  return `会在 ${Number(month)} 月 ${Number(date)} 日上午 10:00 提醒你一次`;
}
