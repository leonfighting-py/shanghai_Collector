import { parseFlexibleDate } from "./parsers/shared.js";

const BOILERPLATE =
  /在小说阅读器[\s\S]*?沉浸阅读|去阅读|跳转到主要内容|点击.*?关注|阅读原文|长按识别|扫码/gi;

function inferReferenceYear(publishTime) {
  if (publishTime) {
    const year = new Date(publishTime).getFullYear();
    if (year >= 2020 && year <= 2100) return year;
  }
  return new Date().getFullYear();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toShanghaiIso(year, month, day, hour = 10, minute = 0) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(`${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return date.toISOString();
}

function lastDayOfMonth(year, month) {
  return new Date(`${year}-${pad2(month)}-01T12:00:00+08:00`);
}

function endOfMonthIso(year, month) {
  const probe = lastDayOfMonth(year, month);
  probe.setMonth(probe.getMonth() + 1);
  probe.setDate(0);
  return toShanghaiIso(probe.getFullYear(), probe.getMonth() + 1, probe.getDate(), 21, 0);
}

export function parseChineseEventDateRange(dateText, { publishTime } = {}) {
  if (!dateText?.trim()) return null;
  const text = dateText.replace(/\s+/g, " ").trim();
  const refYear = inferReferenceYear(publishTime);

  const dottedRange = text.match(
    /^(20\d{2})[./](\d{1,2})[./](\d{1,2})\s*[-–—~至到]\s*(\d{1,2})\s*月/,
  );
  if (dottedRange) {
    return {
      start_time: toShanghaiIso(dottedRange[1], dottedRange[2], dottedRange[3]),
      end_time: endOfMonthIso(Number(dottedRange[1]), Number(dottedRange[4])),
    };
  }

  const fullRange = text.match(
    /^(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[-–—~至到]\s*(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})?\s*日?/,
  );
  if (fullRange) {
    const endYear = fullRange[4] ? Number(fullRange[4]) : Number(fullRange[1]);
    const endMonth = Number(fullRange[5]);
    const endDay = fullRange[6] ? Number(fullRange[6]) : null;
    return {
      start_time: toShanghaiIso(fullRange[1], fullRange[2], fullRange[3]),
      end_time: endDay
        ? toShanghaiIso(endYear, endMonth, endDay, 21, 0)
        : endOfMonthIso(endYear, endMonth),
    };
  }

  const monthOnlyRange = text.match(/^(\d{1,2})\s*月\s*[-–—~至到]\s*(\d{1,2})\s*月/);
  if (monthOnlyRange) {
    return {
      start_time: toShanghaiIso(refYear, monthOnlyRange[1], 1),
      end_time: endOfMonthIso(refYear, monthOnlyRange[2]),
    };
  }

  const multipleInMonth = text.match(/^(20\d{2})\s*年\s*(\d{1,2})\s*月\s*多个场次/);
  if (multipleInMonth) {
    return {
      start_time: toShanghaiIso(multipleInMonth[1], multipleInMonth[2], 1),
      end_time: endOfMonthIso(Number(multipleInMonth[1]), Number(multipleInMonth[2])),
    };
  }

  const monthLongRun = text.match(/^(\d{1,2})\s*月\s*长期/);
  if (monthLongRun) {
    return {
      start_time: toShanghaiIso(refYear, monthLongRun[1], 1),
      end_time: endOfMonthIso(refYear, monthLongRun[1]),
    };
  }

  const singleCn = text.match(/^(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (singleCn) {
    return {
      start_time: toShanghaiIso(singleCn[1], singleCn[2], singleCn[3]),
      end_time: null,
    };
  }

  const dottedSingle = text.match(/^(20\d{2})[./](\d{1,2})[./](\d{1,2})/);
  if (dottedSingle) {
    return {
      start_time: toShanghaiIso(dottedSingle[1], dottedSingle[2], dottedSingle[3]),
      end_time: null,
    };
  }

  const monthDay = text.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (monthDay) {
    return {
      start_time: toShanghaiIso(refYear, monthDay[1], monthDay[2]),
      end_time: null,
    };
  }

  return null;
}

export function parseChineseEventTime(timeText) {
  if (!timeText) return { hour: 10, minute: 0 };
  const match = timeText.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!match) return { hour: 10, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function cleanVenue(raw = "") {
  return normalizeVenue(raw);
}

function cleanTitle(raw = "") {
  return raw
    .replace(BOILERPLATE, " ")
    .replace(/\*{1,2}/g, "")
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function trimEventContext(beforeText, isFirst) {
  if (!isFirst) return beforeText;
  const anchoredTop = beforeText.search(/Top\s*\d+(?=[\u4e00-\u9fff「《])/i);
  if (anchoredTop >= 0) return beforeText.slice(anchoredTop);
  const spacedTop = beforeText.search(/Top\s*\d+\s+[\u4e00-\u9fff「《]/i);
  if (spacedTop >= 0) return beforeText.slice(spacedTop);
  return beforeText.slice(-160);
}

function pickTitleFromContext(beforeText, { isFirst = false } = {}) {
  let compact = cleanTitle(trimEventContext(beforeText, isFirst));
  if (!compact) return null;

  compact = compact.replace(/^(?:Top\s*\d+|本月必看\s*\d*)\s*/i, "").trim();

  const parts = compact
    .split(/[。！？\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const filtered = parts.filter(
    (part) => !/^\d{1,2}月[^。]{0,24}(TOP\s*\d+|合集|清单|指南|汇总)\s*$/i.test(part),
  );
  let tail = filtered[filtered.length - 1] || parts[parts.length - 1] || compact;
  tail = tail.replace(/^\d{1,2}月[^。]{0,24}(TOP\s*\d+|合集|清单|指南|汇总)\s*/i, "").trim();

  const quotedMatches = [...tail.matchAll(/([^。！？\n]{0,10}[「《][^」》]{2,36}[」》][^。！？\n]{0,16})/g)];
  if (quotedMatches.length > 0) {
    const candidate = cleanTitle(quotedMatches[quotedMatches.length - 1][1]);
    if (candidate.length >= 4 && !/^(Shanghai|上海)/i.test(candidate)) {
      return candidate.replace(/^(?:Top\s*\d+|本月必看\s*\d*)\s*/i, "").trim();
    }
  }

  const shortTitle = tail.match(
    /^(.{4,48}?)(?=本世纪|全球|华语|跨越|这件|这场|此次|带你|走进|集结|横跨|时隔|这座|位于|将于|Soft|Sleep|不用|两小时|汇聚|逾 \d+|柔和克制|戴上面具|你能亲眼|小时的高密度|和解，也是)/,
  );
  if (shortTitle?.[1]) return shortTitle[1].trim();

  const colonNamed = tail.match(
    /([\u4e00-\u9fffA-Za-z0-9·・&\s]{2,24}[：:][\u4e00-\u9fffA-Za-z0-9·・\s]{2,12})/,
  );
  if (colonNamed?.[1]) return colonNamed[1].trim();

  if (tail.length <= 48) return tail;

  const bracketTitle = tail.match(/(.{4,48}?)[」》](?:演唱会|特展|展|活动)?/);
  if (bracketTitle?.[1]) return `${bracketTitle[1]}${tail.includes("」") ? "」" : ""}`.trim();

  return tail.slice(0, 48).trim();
}

function normalizeVenue(raw = "") {
  let venue = raw.replace(/\s+/g, " ").trim();
  const embeddedDate = venue.indexOf("日期");
  if (embeddedDate > 0) venue = venue.slice(0, embeddedDate).trim();

  const afterCloseParen = venue.match(/^(.*?[）)])\s*([\u4e00-\u9fff「《(（&].*)$/);
  if (afterCloseParen?.[2]?.length > 4) {
    venue = afterCloseParen[1].trim();
  }

  const afterVenueKeyword = venue.match(
    /^(.+?(?:中心|馆|厅|院|酒店|广场|艺术中心|Livehouse|MAO|体育场|商城|大厦|天地|空间|club|Club))\s+([\u4e00-\u9fff「《(（&《].*)$/i,
  );
  if (afterVenueKeyword?.[2]?.length > 4) {
    venue = afterVenueKeyword[1].trim();
  }

  const gluedNextTitle = venue.match(
    /^(.+?(?:中心|馆|厅|院|酒店|广场|艺术中心|Livehouse|MAO|体育场|商城|大厦|天地|空间|club|Club))([\u4e00-\u9fff「《][^，,。]{2,})/,
  );
  if (gluedNextTitle?.[2]?.length > 4 && !gluedNextTitle[2].startsWith("（")) {
    venue = gluedNextTitle[1].trim();
  }

  return venue.slice(0, 120);
}

function inferCategory(title, defaultCategory = "线下活动") {
  const text = `${title}`;
  if (/展览|特展|美术馆|博物馆|个展|双年展|作品展|艺术回顾展|：独白/.test(text)) return "展览";
  if (/演唱会|音乐会|live|演出|音乐节|巡演|开唱|LIVE/i.test(text)) return "演出音乐";
  if (/讲座|论坛|分享会|talk|高校|大学/.test(text)) return "高校讲座";
  if (/AI|人工智能|meetup|黑客松|开发者/.test(text)) return "AI聚会";
  return defaultCategory;
}

function applyTimeToIso(iso, timeText) {
  if (!iso) return null;
  const { hour, minute } = parseChineseEventTime(timeText);
  const date = new Date(iso);
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = shanghai.getUTCFullYear();
  const m = shanghai.getUTCMonth() + 1;
  const d = shanghai.getUTCDate();
  return toShanghaiIso(y, m, d, hour, minute);
}

export function extractEventsFromArticleText(text, { title, publishTime, link, accountName, defaultCategory = "线下活动" } = {}) {
  if (!text?.trim()) return [];

  const cleaned = text.replace(BOILERPLATE, " ").replace(/\s+/g, " ");
  const dateMarkers = [...cleaned.matchAll(/日期[：:]/g)];
  const events = [];
  let contextStart = 0;

  for (let index = 0; index < dateMarkers.length; index += 1) {
    const dateIndex = dateMarkers[index].index;
    const nextDateIndex = dateMarkers[index + 1]?.index ?? cleaned.length;
    const segment = cleaned.slice(dateIndex, nextDateIndex);
    const match = segment.match(/^日期[：:]\s*([^时间]+?)(?:时间[：:]\s*([^地点]+?))?地点[：:]\s*(.+)/);
    if (!match) continue;

    const dateRange = parseChineseEventDateRange(match[1], { publishTime });
    if (!dateRange?.start_time) continue;

    const titleCandidate = pickTitleFromContext(cleaned.slice(contextStart, dateIndex), {
      isFirst: index === 0,
    });
    if (!titleCandidate) continue;

    const venue = cleanVenue(match[3]) || "上海";
    const rawVenueStart = dateIndex + segment.indexOf(match[3]);
    const venueOffset = match[3].indexOf(venue);
    contextStart = rawVenueStart + (venueOffset >= 0 ? venueOffset : 0) + venue.length;

    events.push({
      title: titleCandidate,
      start_time: applyTimeToIso(dateRange.start_time, match[2]),
      end_time: dateRange.end_time,
      venue,
      category: inferCategory(titleCandidate, defaultCategory),
      link,
      account_name: accountName,
    });
  }

  if (events.length > 0) return events;

  const fallbackDate =
    parseChineseEventDateRange(cleaned, { publishTime }) ||
    parseChineseEventDateRange(title || "", { publishTime }) ||
    parseTitleMonthFallback(title, publishTime);

  if (!fallbackDate?.start_time) return [];

  return [
    {
      title: cleanTitle(title),
      start_time: fallbackDate.start_time,
      end_time: fallbackDate.end_time,
      venue: extractVenueFromText(cleaned) || "上海",
      category: inferCategory(title, defaultCategory),
      link,
      account_name: accountName,
    },
  ];
}

function parseTitleMonthFallback(title, publishTime) {
  if (!title) return null;
  const refYear = inferReferenceYear(publishTime);
  const monthMatch = title.match(/(\d{1,2})\s*月/);
  if (!monthMatch) return null;
  return {
    start_time: toShanghaiIso(refYear, monthMatch[1], 1),
    end_time: endOfMonthIso(refYear, monthMatch[1]),
  };
}

function extractVenueFromText(text) {
  const venueMatch = text.match(/地点[：:]\s*([^\n]+)/);
  return venueMatch ? cleanVenue(venueMatch[1]) : null;
}

export function parseFlexibleDateFromWechat(text, publishTime) {
  const range = parseChineseEventDateRange(text, { publishTime });
  if (range?.start_time) return range.start_time;
  return parseFlexibleDate(text, inferReferenceYear(publishTime));
}
