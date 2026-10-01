// 时间展示统一按上海时区（UTC+8）换算，避免设备时区导致的日期偏移
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function pad(value) {
  return value < 10 ? `0${value}` : String(value);
}

function toShanghaiDate(value) {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function eventDate(value) {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${WEEKDAYS[date.getUTCDay()]}`;
}

function eventTime(value) {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

// 今天 / 明天 / 后天（按上海日历日比较），其余返回空
function relativeLabel(value, now = new Date()) {
  const today = toShanghaiDate(now);
  const target = toShanghaiDate(value);
  const diff = Math.round(
    (new Date(`${target}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000,
  );
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  return "";
}

// 活动时间区间：同日 "10月1日 周四 19:30–21:00"，跨日补结束日期
function eventPeriod(event) {
  const start = event.start_time;
  if (!start) return "";
  const dateText = eventDate(start);
  const startHM = eventTime(start);
  if (!event.end_time) return `${dateText} ${startHM}`;
  const sameDay = toShanghaiDate(event.end_time) === toShanghaiDate(start);
  if (sameDay) return `${dateText} ${startHM}–${eventTime(event.end_time)}`;
  return `${dateText} ${startHM} 至 ${eventDate(event.end_time)} ${eventTime(event.end_time)}`;
}

module.exports = { toShanghaiDate, eventDate, eventTime, relativeLabel, eventPeriod };
