// 活动 → iCalendar（RFC 5545）文本。纯函数，不碰网络、不碰数据库，方便单测。
//
// 只有三处容易写错，都在这儿处理掉了：
//   1. 时区：上海 1991 年后没有夏令时，固定 +08:00。仍然带 VTIMEZONE，
//      因为 Google 日历会优先用 TZID 查找自身时区库，缺失时按 UTC 解释 → 全偏 8 小时。
//   2. 折行：75 **octets** 不是 75 个字符。中文一字 3 字节，按字符折会超限被日历拒收。
//   3. 转义：描述里的逗号、分号、反斜杠不转义会把字段切开，导入后字段错位。

export const CALENDAR_TIMEZONE = "Asia/Shanghai";

/** 没有结束时间的单场活动默认算 2 小时 */
const DEFAULT_DURATION_HOURS = 2;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FOLD_LIMIT = 75;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** RFC 5545 TEXT 转义：反斜杠、分号、逗号，换行写成字面 \n */
export function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * 按 UTF-8 字节折行。续行以一个空格开头，那个空格也计入 75 字节，
 * 所以续行正文最多 74 字节；且不能把一个多字节字符劈成两半。
 */
export function foldLine(line, limit = FOLD_LIMIT) {
  const bytes = encoder.encode(line);
  if (bytes.length <= limit) return line;

  const chunks = [];
  let offset = 0;
  while (offset < bytes.length) {
    const budget = offset === 0 ? limit : limit - 1;
    let end = Math.min(offset + budget, bytes.length);
    // 退到 UTF-8 起始字节：0b10xxxxxx 是续接字节
    while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === offset) end = Math.min(offset + budget, bytes.length);
    chunks.push(decoder.decode(bytes.subarray(offset, end)));
    offset = end;
  }
  return chunks.join("\r\n ");
}

/** UTC 形式：20261116T113000Z */
function formatUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

/** 上海本地形式（配合 TZID）：20261116T193000 */
function formatLocal(date) {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().replace(/[-:]/g, "").slice(0, 15);
}

/** 全天事件用日期形式：20261116 */
function formatDate(day) {
  return String(day).replace(/-/g, "");
}

function addDays(day, days) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function hostOf(siteUrl) {
  try {
    return new URL(siteUrl).host;
  } catch {
    return String(siteUrl || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "localhost";
  }
}

function shanghaiClock(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(11, 16);
}

function shanghaiDay(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

// 固定偏移时区不需要 RRULE；STANDARD + TZOFFSETFROM/TO 就够了
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${CALENDAR_TIMEZONE}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0800",
  "TZOFFSETTO:+0800",
  "TZNAME:CST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/**
 * 一条活动 → VEVENT 行数组。开始时间缺了或解析不了就返回空数组（宁可少一条，不要生成坏事件）。
 *
 * 跨天活动一律写成全天事件：一条 VEVENT 表达不了「连演三天、每天 19:30」，
 * 全天事件至少语义正确（这几天有这回事），开场时间写进描述。
 */
function buildVevent(event, { host, siteUrl, now }) {
  const start = new Date(event.start_time);
  if (Number.isNaN(start.getTime())) return [];

  const startDay = shanghaiDay(start);
  const endValue = event.end_time ? new Date(event.end_time) : null;
  const endDay = endValue && !Number.isNaN(endValue.getTime()) ? shanghaiDay(endValue) : startDay;
  const isAllDay = endDay > startDay;

  const lines = ["BEGIN:VEVENT", `UID:${event.slug || "event"}@${host}`, `DTSTAMP:${formatUtc(now)}`];

  if (isAllDay) {
    // DTEND 是排他的：跨到 11.17 的展览，DTEND 要写 11.18
    lines.push(`DTSTART;VALUE=DATE:${formatDate(startDay)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(addDays(endDay, 1))}`);
  } else {
    const fallbackEnd = new Date(start.getTime() + DEFAULT_DURATION_HOURS * 60 * 60 * 1000);
    const end = endValue && !Number.isNaN(endValue.getTime()) && endValue > start ? endValue : fallbackEnd;
    lines.push(`DTSTART;TZID=${CALENDAR_TIMEZONE}:${formatLocal(start)}`);
    lines.push(`DTEND;TZID=${CALENDAR_TIMEZONE}:${formatLocal(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);

  const description = [];
  if (event.summary) description.push(event.summary);
  if (isAllDay) {
    const clock = shanghaiClock(start);
    if (clock && clock !== "00:00") description.push(`每天 ${clock} 开场`);
  }
  if (event.source_name) description.push(`来源：${event.source_name}`);
  if (event.signup_url) description.push(`报名：${event.signup_url}`);
  if (siteUrl && event.slug) description.push(`详情：${siteUrl}/e/${event.slug}`);
  if (description.length > 0) lines.push(`DESCRIPTION:${escapeText(description.join("\n"))}`);

  if (event.venue) lines.push(`LOCATION:${escapeText(event.venue)}`);
  if (siteUrl && event.slug) lines.push(`URL:${siteUrl}/e/${event.slug}`);
  if (event.category) lines.push(`CATEGORIES:${escapeText(event.category)}`);

  lines.push("END:VEVENT");
  return lines;
}

/**
 * 组装整份日历。CRLF 行尾是 RFC 要求，不是风格问题。
 *
 * @param {Array<object>} events 已由 filterPublishableEvents 处理过的活动（需要 slug）
 * @param {{siteUrl?: string, calendarName?: string, now?: Date}} options
 */
export function buildCalendar(events, { siteUrl = "", calendarName = "上海近两日活动", now = new Date() } = {}) {
  const host = hostOf(siteUrl);
  const context = { host, siteUrl: String(siteUrl || "").replace(/\/+$/, ""), now };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shanghai Radar//Events//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
    ...VTIMEZONE,
  ];

  for (const event of events) {
    lines.push(...buildVevent(event, context));
  }

  lines.push("END:VCALENDAR");
  return lines.map((line) => foldLine(line)).join("\r\n") + "\r\n";
}
