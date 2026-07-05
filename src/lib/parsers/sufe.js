import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.sufe.edu.cn";

/**
 * Parse the cultureDate JavaScript array from SUFE homepage HTML.
 * Structure:
 *   cultureDate = [
 *     {
 *       title: 'event name',
 *       f1: "2026-06-27 08:30:06.0",  // datetime
 *       f2: "venue info",               // venue
 *       url: "/11/62/c19548a266594/page.htm",
 *     },
 *     ...
 *   ];
 */
function extractCultureDateEvents(html) {
  // Find the cultureDate array definition
  const arrayMatch = html.match(/var cultureDate = \[([\s\S]*?)\];/);
  if (!arrayMatch) return [];

  const arrayStr = arrayMatch[1];
  const items = [];
  // Match each object in the array
  const objRegex = /\{\s*title:\s*'([^']+)',\s*f1:\s*"([^"]+)",\s*f2:\s*"([^"]*)",\s*url:\s*"([^"]+)"\s*,?\s*\}/g;
  let match;

  while ((match = objRegex.exec(arrayStr)) !== null) {
    const title = match[1].trim();
    const datetime = match[2].trim();
    const venue = match[3].trim();
    const urlPath = match[4].trim();

    if (!title || !datetime) continue;

    // Parse datetime: "2026-06-27 08:30:06.0" or "2026-07-11 13:00:12.0"
    const dateMatch = datetime.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    const dateStr = dateMatch[1];

    // Extract hour from datetime string
    const hourMatch = datetime.match(/ (\d{2}):/);
    const hour = hourMatch ? parseInt(hourMatch[1], 10) : 10;

    const startTime = `${dateStr}T${String(hour).padStart(2, "0")}:00:00+08:00`;

    // Build absolute URL
    const url = urlPath.startsWith("http") ? urlPath : `${BASE_URL}${urlPath}`;

    // Use venue from data, or default to campus name
    const venueName = venue || "上海财经大学";

    items.push({
      title: decodeHtml(title),
      start_time: startTime,
      venue: venueName,
      url,
    });
  }

  return items;
}

/**
 * Also try to parse events from the "文化上财" (Cultural SUFE) section
 * which has <div class="news_info"> with <p class="info date"> and <p class="info address">
 */
function extractCulturalEvents(html) {
  const events = [];
  // Find news items with date and address info
  const itemRegex = /<div class="news_wz">[\s\S]*?<div class="news_title line2"><a\s+href='([^']+)'[^>]*title='([^']*)'[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="news_info">[\s\S]*?<p class="info date">([^<]+)<\/p>[\s\S]*?<p class="info address">([^<]+)<\/p>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const href = match[1];
    const titleAttr = decodeHtml(match[2]);
    const title = titleAttr || decodeHtml(match[3].replace(/<[^>]+>/g, ""));
    const dateText = match[4].trim();
    const address = match[5].trim();

    if (!title || !dateText) continue;
    // Skip items without useful dates
    if (dateText === "见详情页" || dateText.length < 6) continue;

    // Try to parse various date formats
    const dateParsed = parseCulturalDate(dateText);
    if (!dateParsed) continue;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    events.push({
      title,
      start_time: dateParsed.start_time,
      end_time: dateParsed.end_time || `${dateParsed.start_time.slice(0, 10)}T21:00:00+08:00`,
      venue: address !== "见详情页" ? address : "上海财经大学",
      url,
    });
  }

  return events;
}

function parseCulturalDate(text) {
  if (!text) return null;

  // "2026年7月1日至2026年7月31日"
  const cnFull = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*至\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cnFull) {
    return {
      start_time: formatDate(cnFull[1], cnFull[2], cnFull[3], 10),
      end_time: formatDate(cnFull[4], cnFull[5], cnFull[6], 21),
    };
  }

  // "2026年7月"
  const cnMonth = text.match(/^(20\d{2})\s*年\s*(\d{1,2})\s*月$/);
  if (cnMonth) {
    return {
      start_time: formatDate(cnMonth[1], cnMonth[2], "01", 10),
      end_time: formatDate(cnMonth[1], cnMonth[2], "28", 21),
    };
  }

  // "2026年6月16日18:30—20:00"
  const cnTime = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d{2})/);
  if (cnTime) {
    return {
      start_time: formatDate(cnTime[1], cnTime[2], cnTime[3], parseInt(cnTime[4], 10)),
      end_time: null,
    };
  }

  // "2026年6月8日-14日"
  const cnShort = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[–—\-]\s*(\d{1,2})\s*日/);
  if (cnShort) {
    return {
      start_time: formatDate(cnShort[1], cnShort[2], cnShort[3], 10),
      end_time: formatDate(cnShort[1], cnShort[2], cnShort[4], 21),
    };
  }

  // "2026年4月24日13:30—15:30"
  const cnDetail = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}):(\d{2})[–—\-]\s*(\d{1,2}):(\d{2})/);
  if (cnDetail) {
    return {
      start_time: formatDate(cnDetail[1], cnDetail[2], cnDetail[3], parseInt(cnDetail[4], 10)),
      end_time: null,
    };
  }

  // "2026年4月"
  const cnMonthOnly = text.match(/^(20\d{2})\s*年\s*(\d{1,2})\s*月$/);
  if (cnMonthOnly) {
    return {
      start_time: formatDate(cnMonthOnly[1], cnMonthOnly[2], "01", 10),
      end_time: formatDate(cnMonthOnly[1], cnMonthOnly[2], "28", 21),
    };
  }

  return null;
}

function formatDate(year, month, day, hour = 10) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, "0");
  const d = String(Number(day)).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:00:00+08:00`;
}

/**
 * Parse academic/cultural events from 上海财经大学 homepage.
 */
export function parseSufeEvents(html, source) {
  // Primary source: cultureDate JS array (structured academic events)
  const cultureEvents = extractCultureDateEvents(html);

  // Also try the cultural section for additional events
  const culturalEvents = extractCulturalEvents(html);

  const allItems = [...cultureEvents, ...culturalEvents];

  const events = allItems
    .map((item) =>
      buildEvent({
        title: item.title,
        start_time: item.start_time,
        end_time: item.end_time || `${item.start_time.slice(0, 10)}T21:00:00+08:00`,
        venue: item.venue,
        signup_url: item.url,
        source,
      }),
    )
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
