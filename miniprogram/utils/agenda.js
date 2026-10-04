// 日程表视图模型 —— src/lib/agenda.js 的 CommonJS 移植（小程序不能引用 src/）。
// 规则与 Web 端完全一致，改分桶 / 露出规则时两边要一起改。
//
// 一条活动占它的整个日期区间 [startDay, endDay]，在区间内的每一天都算数：
//   start —— 当天开始（跨天的标「首日」）
//   last  —— 当天是最后一天
//   run   —— 展期中（已开始、未结束）。数量很大，每天只挑几条露出，其余折叠
const format = require("./format.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WINDOW_DAYS = 14;
// 手机一屏放不下几行，每天至少露出 3 行（Web 是 5 行）
const MIN_ROWS = 3;
const ENDING_SOON_DAYS = 3;

function startDay(event) {
  return event.start_time ? format.toShanghaiDate(event.start_time) : "";
}

// 没有 end_time 或 end_time 不晚于开始日的，一律按单日活动处理
function endDay(event) {
  const start = startDay(event);
  const end = event.end_time ? format.toShanghaiDate(event.end_time) : "";
  return end && end > start ? end : start;
}

function isMultiDay(event) {
  return endDay(event) > startDay(event);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function spanDays(event) {
  return daysBetween(startDay(event), endDay(event)) + 1;
}

// "2026-10-04" → "10.04"
function dotDate(date) {
  return String(date || "").slice(5).replace("-", ".");
}

function listWindowDays(today, count) {
  const start = Date.parse(`${today}T00:00:00Z`);
  const days = [];
  for (let index = 0; index < count; index += 1) {
    days.push(new Date(start + index * DAY_MS).toISOString().slice(0, 10));
  }
  return days;
}

function rangeText(event) {
  if (!isMultiDay(event)) return "";
  return `${dotDate(startDay(event))} — ${dotDate(endDay(event))} · 共 ${spanDays(event)} 天`;
}

function byStartTime(left, right) {
  return new Date(left.start_time).getTime() - new Date(right.start_time).getTime();
}

function imageRank(event) {
  return event.image_url ? 1 : 0;
}

// ongoing：今天之前开始、今天仍未结束；upcoming：今天及之后才开始
function splitByToday(events, today) {
  const ongoing = [];
  const upcoming = [];
  events.forEach((event) => {
    const start = startDay(event);
    if (!start) return;
    if (start >= today) upcoming.push(event);
    else if (endDay(event) >= today) ongoing.push(event);
  });
  upcoming.sort(byStartTime);
  ongoing.sort((left, right) => imageRank(right) - imageRank(left) || byStartTime(left, right));
  return { ongoing, upcoming };
}

// 从展期中的活动里挑 need 条直接露出：先放快结束的，其余按 dayIndex 轮换，
// 避免连续几天露出的都是同一批
function featureRunning(running, date, need, dayIndex) {
  if (need <= 0 || !running.length) return { featured: [], folded: running };
  const soon = [];
  const rest = [];
  running.forEach((event) => {
    (daysBetween(date, endDay(event)) <= ENDING_SOON_DAYS ? soon : rest).push(event);
  });
  rest.sort((left, right) => imageRank(right) - imageRank(left));
  const shift = rest.length ? (dayIndex * need) % rest.length : 0;
  const featured = soon.concat(rest.slice(shift), rest.slice(0, shift)).slice(0, need);
  return { featured, folded: running.filter((event) => featured.indexOf(event) < 0) };
}

function buildAgenda(events, today, options) {
  const days = (options && options.days) || WINDOW_DAYS;
  const minRows = (options && options.minRows) || MIN_ROWS;

  return listWindowDays(today, days).map((date, dayIndex) => {
    const starts = [];
    const ends = [];
    const running = [];
    events.forEach((event) => {
      const start = startDay(event);
      if (!start) return;
      const end = endDay(event);
      if (start === date) starts.push(event);
      else if (end === date && start < date) ends.push(event);
      else if (start < date && end > date) running.push(event);
    });
    starts.sort(byStartTime);
    running.sort((left, right) => (endDay(left) < endDay(right) ? -1 : endDay(left) > endDay(right) ? 1 : 0));

    const picked = featureRunning(running, date, minRows - starts.length - ends.length, dayIndex);
    const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();

    return {
      date,
      day: date.slice(8),
      month: Number(date.slice(5, 7)),
      weekday: WEEKDAYS[weekdayIndex],
      isToday: date === today,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
      rows: starts
        .map((event) => ({ event, kind: "start" }))
        .concat(ends.map((event) => ({ event, kind: "last" })))
        .concat(picked.featured.map((event) => ({ event, kind: "run" }))),
      folded: picked.folded,
      startCount: starts.length,
      endCount: ends.length,
      runningCount: running.length,
    };
  });
}

// 一行活动左侧「时间」栏和标题下强调色小字的文案
function rowLabels(event, kind, date) {
  if (kind === "last") return { time: "末日", range: rangeText(event), span: true };
  if (kind === "run") {
    return {
      time: "展期",
      range: `至 ${dotDate(endDay(event))} · 还剩 ${daysBetween(date, endDay(event))} 天`,
      span: true,
    };
  }
  return { time: format.eventTime(event.start_time), range: rangeText(event), span: false };
}

module.exports = {
  WINDOW_DAYS,
  startDay,
  endDay,
  isMultiDay,
  spanDays,
  dotDate,
  daysBetween,
  listWindowDays,
  rangeText,
  splitByToday,
  featureRunning,
  buildAgenda,
  rowLabels,
};
