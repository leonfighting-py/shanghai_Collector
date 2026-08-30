import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const DETAIL_BASE = "https://www.gewara.com/detail/";

/**
 * Build an ISO 8601 datetime string in Shanghai timezone.
 *
 * @param {number|string} year
 * @param {number|string} month
 * @param {number|string} day
 * @param {number} [hour=10]
 * @param {number} [minute=0]
 * @returns {string|null}
 */
function toShanghaiIso(year, month, day, hour = 10, minute = 0) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, "0");
  const d = String(Number(day)).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  const date = new Date(`${y}-${m}-${d}T${h}:${min}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y) return null;
  return `${y}-${m}-${d}T${h}:${min}:00+08:00`;
}

/**
 * Parse Gewara date text into start_time and end_time.
 *
 * Supported formats:
 *   "2026.08.15 / 08.16"          → start 08.15, end 08.16
 *   "2026.07.17 - 07.19"          → start 07.17, end 07.19
 *   "2026.07.05 19:00 周日"       → start 07.05 19:00
 *   "2026.06.27 - 2026.10.18"    → start 06.27, end 10.18
 *   "2025.02.17 - 2026.07.31"    → start 02.17 2025, end 07.31 2026
 *
 * @param {string} dateText
 * @returns {{start_time: string|null, end_time: string|null}}
 */
function parseDateRange(dateText) {
  if (!dateText?.trim()) return { start_time: null, end_time: null };
  const text = dateText.trim();

  // Single date with time: "2026.07.05 19:00 周日"
  const singleWithTime = text.match(
    /^(20\d{2})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (singleWithTime && !/[-–—~]/.test(text) && !/\//.test(text.replace(/^\d{4}\.\d{1,2}\.\d{1,2}\s+\d{1,2}:\d{2}/, ""))) {
    return {
      start_time: toShanghaiIso(
        singleWithTime[1],
        singleWithTime[2],
        singleWithTime[3],
        singleWithTime[4],
        singleWithTime[5],
      ),
      end_time: toShanghaiIso(
        singleWithTime[1],
        singleWithTime[2],
        singleWithTime[3],
        21,
        0,
      ),
    };
  }

  // Range separated by "/" : "2026.08.15 / 08.16"
  const slashRange = text.match(
    /^(20\d{2})\.(\d{1,2})\.(\d{1,2})\s*\/\s*(\d{1,2})\.(\d{1,2})/,
  );
  if (slashRange) {
    return {
      start_time: toShanghaiIso(slashRange[1], slashRange[2], slashRange[3]),
      end_time: toShanghaiIso(slashRange[1], slashRange[4], slashRange[5], 21),
    };
  }

  // Range separated by "-" : "2026.07.17 - 07.19" or "2026.06.27 - 2026.10.18"
  const dashRange = text.match(
    /^(20\d{2})\.(\d{1,2})\.(\d{1,2})\s*[-–—~]\s*(20\d{2})?\.?(\d{1,2})\.(\d{1,2})/,
  );
  if (dashRange) {
    const year1 = dashRange[1];
    const year2 = dashRange[4] || year1;
    return {
      start_time: toShanghaiIso(year1, dashRange[2], dashRange[3]),
      end_time: toShanghaiIso(year2, dashRange[5], dashRange[6], 21),
    };
  }

  // Single date with optional time: "2026.07.05 周日" or "2026.08.16 周日"
  const singleDate = text.match(/^(20\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (singleDate) {
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    const hour = timeMatch ? parseInt(timeMatch[1], 10) : 10;
    const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;
    return {
      start_time: toShanghaiIso(singleDate[1], singleDate[2], singleDate[3], hour, minute),
      end_time: toShanghaiIso(singleDate[1], singleDate[2], singleDate[3], 21),
    };
  }

  return { start_time: null, end_time: null };
}

/**
 * 从内联 __NEXT_DATA__ JS 变量中提取 performanceId → posterUrl 映射。
 * 数据形如 { props: { pageProps: { categoryList: [ { hotXxxList: [ { performanceId, posterUrl, ... } ] } ] } } }
 *
 * @param {string} html
 * @returns {Map<string, string>}
 */
/**
 * 从 startBrace 开始做括号平衡扫描，返回完整 JSON 文本。
 * 跳过字符串字面量中的括号和转义。
 */
function extractBalancedJson(text, startBrace) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startBrace; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(startBrace, index + 1);
    }
  }
  return null;
}

function extractPosterMap(html) {
  const map = new Map();
  // __NEXT_DATA__ = {...}（JS 变量赋值；同一 script 内还跟有其他代码）
  const start = html.match(/__NEXT_DATA__\s*=\s*\{/);
  if (!start) return map;
  const jsonText = extractBalancedJson(html, html.indexOf("{", start.index));

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return map;
  }

  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      if (node.performanceId && node.posterUrl && /^https?:\/\//.test(String(node.posterUrl))) {
        map.set(String(node.performanceId), String(node.posterUrl));
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(data);

  return map;
}

/**
 * Extract events from Gewara hotlist section (main content grid).
 * Each card: div.hotlist-item with id="{id}hotlist-item"
 *
 * @param {string} html
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>}
 */
function extractHotlistItems(html, source, posters) {
  const events = [];

  // Match each hotlist item card
  const cardRegex = /<div\b[^>]*id="(\d+)hotlist-item"[^>]*>([\s\S]*?)(?=<div\b[^>]*id="\d+hotlist-item"|<div\b[^>]*id="\d+newlist-item"|$)/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const eventId = match[1];
    const card = match[2];

    // Title: inside .hotlist-item-name > p
    const titleMatch = card.match(
      /class="[^"]*hotlist-item-name[^"]*"[^>]*>[\s\S]*?<p\b[^>]*>([^<]+)<\/p>/i,
    );
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]);
    if (!title) continue;

    // Venue: inside .hotlist-item-location p.location
    const venueMatch = card.match(
      /class="[^"]*location[^"]*"[^>]*>([^<]+)</i,
    );
    const venue = venueMatch
      ? decodeHtml(venueMatch[1]).trim()
      : "上海";

    // Date: inside .hotlist-item-location p.date
    const dateMatch = card.match(
      /class="[^"]*date[^"]*"[^>]*>([^<]+)</i,
    );
    if (!dateMatch) continue;

    const range = parseDateRange(dateMatch[1].trim());
    if (!range?.start_time) continue;

    const signupUrl = `${DETAIL_BASE}${eventId}`;

    const event = buildEvent({
      title,
      start_time: range.start_time,
      end_time: range.end_time,
      venue,
      signup_url: signupUrl,
      image_url: posters.get(eventId),
      source,
    });

    if (event) events.push(event);
  }

  return events;
}

/**
 * Extract events from Gewara newlist section (right sidebar).
 * Each card: li.newlist-item with id="{id}newlist-item"
 *
 * @param {string} html
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>}
 */
function extractNewlistItems(html, source) {
  const events = [];

  // Match each newlist item
  const cardRegex = /<li\b[^>]*id="(\d+)newlist-item"[^>]*>([\s\S]*?)(?=<li\b[^>]*id="\d+newlist-item"|<\/ul>|$)/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const eventId = match[1];
    const card = match[2];

    // Title: inside .newlist-item-name
    const titleMatch = card.match(
      /class="[^"]*newlist-item-name[^"]*"[^>]*>([^<]+)</i,
    );
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]);
    if (!title) continue;

    // Date: inside .newlist-item-time
    const dateMatch = card.match(
      /class="[^"]*newlist-item-time[^"]*"[^>]*>([^<]+)</i,
    );
    if (!dateMatch) continue;

    const range = parseDateRange(dateMatch[1].trim());
    if (!range?.start_time) continue;

    const signupUrl = `${DETAIL_BASE}${eventId}`;

    const event = buildEvent({
      title,
      start_time: range.start_time,
      end_time: range.end_time,
      venue: "上海",
      signup_url: signupUrl,
      source,
    });

    if (event) events.push(event);
  }

  return events;
}

/**
 * Parse Gewara ticketing homepage.
 *
 * The page (https://www.gewara.com/) is a Next.js SSR page with
 * server-rendered content in two sections:
 *
 * 1. Hotlist (main grid) — .hotlist-item cards with id="{id}hotlist-item"
 *    containing title, venue, date, and poster image.
 * 2. Newlist (sidebar) — li.newlist-item cards with id="{id}newlist-item"
 *    containing title and date (no venue).
 *
 * Detail page links are not present in the HTML (Next.js uses client-side
 * routing). URLs are constructed from the numeric event ID.
 *
 * @param {string} html - Listing page HTML
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>} Parsed events
 */
export function parseGewara(html, source) {
  const posters = extractPosterMap(html);
  const hotlistEvents = extractHotlistItems(html, source, posters);
  const newlistEvents = extractNewlistItems(html, source);

  // Deduplicate: hotlist + newlist may overlap; prefer hotlist (richer data)
  const allEvents = [...hotlistEvents, ...newlistEvents];

  return uniqueBy(
    allEvents,
    (e) => `${e.title}|${e.start_time}`,
  );
}
