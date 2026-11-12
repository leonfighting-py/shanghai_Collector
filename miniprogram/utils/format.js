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
// 跨日时不再带结束钟点 —— 跨的是"档期"（展览/驻场演出），结束时刻是当天闭馆时间，
// 对用户没有信息量，反而让长期展览读起来像一场 20:00 的演出。
function eventPeriod(event) {
  const start = event.start_time;
  if (!start) return "";
  const dateText = eventDate(start);
  const startHM = eventTime(start);
  if (!event.end_time) return `${dateText} ${startHM}`;
  const sameDay = toShanghaiDate(event.end_time) === toShanghaiDate(start);
  if (sameDay) return `${dateText} ${startHM}–${eventTime(event.end_time)}`;
  return `${dateText} ${startHM} 至 ${eventDate(event.end_time)}`;
}

// 卡片角标：今天/明天/后天优先；已开幕但尚未结束的长期活动（展览/驻场演出）标「进行中」。
// 这类活动的 start_time 在很多天前，relativeLabel 返回空，不加这一层用户会以为它没有时间信息。
function eventBadge(event, now = new Date()) {
  const relative = relativeLabel(event.start_time, now);
  if (relative) return relative;
  if (!event.start_time) return "";
  const today = toShanghaiDate(now);
  const start = toShanghaiDate(event.start_time);
  const end = toShanghaiDate(event.end_time) || start;
  return start < today && end >= today ? "进行中" : "";
}

function shanghaiParts(value) {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

// 列表卡片用的紧凑区间：单日 "10.6 19:30"，跨日同月 "10.6–8"，
// 跨月 "9.24–10.30"，跨年再补年份 "10.6–2027.1.1"。
// 跨日的活动跨的是"档期"而不是某一场的时间，所以不显示具体钟点，
// 否则长期展览会渲染成 "10.6–1.5" 配一个毫无意义的 10:00。
function eventRangeShort(event) {
  const start = event.start_time;
  if (!start) return "";
  const s = shanghaiParts(start);
  const startText = `${s.month}.${s.day}`;
  if (!event.end_time) return `${startText} ${s.time}`;
  // 同一天：钟点是这个活动的起止时间，有信息量，保留
  if (toShanghaiDate(event.end_time) === toShanghaiDate(start)) {
    return `${startText} ${s.time}–${shanghaiParts(event.end_time).time}`;
  }

  // 跨天：跨的是"档期"，不再带钟点
  const e = shanghaiParts(event.end_time);
  const endText =
    e.year !== s.year
      ? `${e.year}.${e.month}.${e.day}`
      : e.month !== s.month
        ? `${e.month}.${e.day}`
        : `${e.day}`;
  return `${startText}–${endText}`;
}

module.exports = {
  toShanghaiDate,
  eventDate,
  eventTime,
  relativeLabel,
  eventPeriod,
  eventRangeShort,
  eventBadge,
};
