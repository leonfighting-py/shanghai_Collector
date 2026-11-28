// 订阅提醒：小程序端的排队规则与模板字段拼装。
//
// 与 src/lib/reminders.js 保持同一套规则（web 侧与小程序侧不能算出不同的时间），
// 但这里是 CommonJS —— 小程序不支持 ESM。改动其中一份时，另一份要同步。
//
// 规则：普通活动 = 开始前 1 天 10:00；长档期展览（跨度 ≥ 14 天）= 闭展前 3 天 10:00。

const agenda = require("./agenda.js");
const format = require("./format.js");

const REMIND_HOUR = 10;
const LONG_RUN_MIN_DAYS = 14;
const LONG_RUN_LEAD_DAYS = 3;

/** 提醒的唯一键：与收藏用的 id 同构（标题|上海日期|场馆），接口 DTO 里没有 slug */
function keyOf(event) {
  if (!event || !event.title) return "";
  return `${event.title}|${format.toShanghaiDate(event.start_time)}|${event.venue || ""}`;
}

/** 日期字符串加减天数，返回该日上海 10:00 的 ISO 串 */
function shiftDays(day, delta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
  const base = new Date(`${day}T00:00:00+08:00`).getTime();
  const target = new Date(base + delta * 86_400_000);
  return `${format.toShanghaiDate(target)}T${String(REMIND_HOUR).padStart(2, "0")}:00:00+08:00`;
}

/**
 * 该在什么时候提醒。返回 ISO 串；不该排（已结束 / 提醒时刻已过）返回 null。
 * @param {object} event 接口返回的活动对象
 * @param {number} nowMs 当前时间戳，测试可注入
 */
function remindAtOf(event, nowMs = Date.now()) {
  if (!event || !event.start_time) return null;
  const startDay = agenda.startDay(event);
  if (!startDay) return null;

  const longRun = agenda.spanDays(event) >= LONG_RUN_MIN_DAYS;
  const anchorDay = longRun ? agenda.endDay(event) : startDay;
  const leadDays = longRun ? LONG_RUN_LEAD_DAYS : 1;

  const remindAt = shiftDays(anchorDay, -leadDays);
  if (!remindAt) return null;
  if (new Date(remindAt).getTime() <= nowMs) return null;
  // 活动已经结束（闭展日早于今天）也不排
  if (agenda.endDay(event) < format.toShanghaiDate(new Date(nowMs))) return null;
  return remindAt;
}

/** 收藏按钮下方那行字，说清「只提醒一次」 */
function describeRemind(remindAt) {
  if (!remindAt) return "";
  const day = format.toShanghaiDate(new Date(remindAt));
  const [, month, date] = day.split("-");
  return `会在 ${Number(month)} 月 ${Number(date)} 日上午 10:00 提醒你一次`;
}

/** 微信 thing 字段上限 20 个字符，超了要自己截断，否则发送时直接报错 */
function clipThing(text, limit = 20) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

/**
 * 第 19 天发送时要填的模板字段（模板：thing2 活动名称 / date3 活动日期 / thing4 活动说明）。
 *
 * 两条硬约束，填错微信直接拒发：
 *   · date 字段**只能填单个日期**，区间（"11-01 至 12-31"）会失败
 *   · thing 字段上限 20 个字符
 * 所以 date3 取「提醒对应的那一天」：普通活动是开始日，长档期展览是闭展日，与提醒时刻同源。
 */
function messageFor(event, remindAt) {
  const longRun = agenda.spanDays(event) >= LONG_RUN_MIN_DAYS;
  const anchorDay = longRun ? agenda.endDay(event) : agenda.startDay(event);
  const [year, month, day] = String(anchorDay || "").split("-");
  return {
    thing2: clipThing(event.title),
    date3: year ? `${year}年${Number(month)}月${Number(day)}日` : "",
    thing4: longRun ? "展览即将闭展，别错过" : "活动就要开始了，别错过",
  };
}

module.exports = {
  LONG_RUN_MIN_DAYS,
  REMIND_HOUR,
  clipThing,
  describeRemind,
  keyOf,
  messageFor,
  remindAtOf,
};
