// 发送侧的时间换算（CommonJS，不依赖 wx-server-sdk，方便单测）。
//
// 库里 remind_at 存的是「上海时间 10:00」的 ISO 串，形状固定为
// YYYY-MM-DDTHH:mm:ss+08:00 —— 只有这样「现在」才能用字符串直接比较大小。

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;
const REMIND_HOUR = 10;
const THING_LIMIT = 20;

function shanghaiDayOf(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 10);
}

/** 与入库格式保持一致：YYYY-MM-DDTHH:mm:ss+08:00 */
function shanghaiIso(ms) {
  return `${new Date(ms + SHANGHAI_OFFSET).toISOString().slice(0, 19)}+08:00`;
}

/** 日期加减天数，落在当天 10:00（与小程序端 utils/reminders.js 的 shiftDays 一致） */
function shiftDays(day, delta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
  const base = new Date(`${day}T00:00:00+08:00`).getTime();
  return `${shanghaiDayOf(base + delta * 86_400_000)}T${String(REMIND_HOUR).padStart(2, "0")}:00:00+08:00`;
}

/** 微信 thing 字段上限 20 字符，超了要自己截断，否则发送报错 */
function clipThing(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length <= THING_LIMIT ? value : `${value.slice(0, THING_LIMIT - 1)}…`;
}

module.exports = { REMIND_HOUR, THING_LIMIT, clipThing, shanghaiDayOf, shanghaiIso, shiftDays };
