import { buildEvent, decodeHtml, absoluteUrl, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.piaoniu.com/";

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
 * Parse Piaoniu date text into start_time and end_time.
 *
 * Supported formats:
 *   "2026.07.17 - 07.19"          → start 07.17, end 07.19
 *   "2026.06.27 - 2026.10.18"    → start 06.27, end 10.18
 *   "2026.07.03- 07.12"           → start 07.03, end 07.12
 *   "2026.10.07 18:00"            → start 10.07 18:00
 *   "2026.08.20 - 08.23（全天性比赛...）" → start 08.20, end 08.23
 *
 * @param {string} dateText
 * @returns {{start_time: string|null, end_time: string|null}}
 */
function parseDateRange(dateText) {
  if (!dateText?.trim()) return { start_time: null, end_time: null };
  const text = dateText.trim();

  // Single date with time: "2026.10.07 18:00"
  const singleWithTime = text.match(
    /^(20\d{2})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (singleWithTime) {
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
      ),
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

  // Single date: "2026.07.05"
  const single = text.match(/^(20\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (single) {
    return {
      start_time: toShanghaiIso(single[1], single[2], single[3]),
      end_time: toShanghaiIso(single[1], single[2], single[3], 21),
    };
  }

  return { start_time: null, end_time: null };
}

/**
 * Clean a Piaoniu title by removing "[上海]" prefix tags and
 * normalizing HTML entities.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanTitle(raw) {
  return decodeHtml(raw)
    .replace(/^\[上海\]\s*/i, "")
    .replace(/\[上海\]/g, "")
    .trim();
}

/**
 * Extract events from a category-block section on the Piaoniu homepage.
 *
 * Only category-block sections have dates and venues.
 * category-list sections (音乐会, 戏曲综艺, 舞蹈芭蕾, etc.) have no dates
 * and are skipped.
 *
 * @param {string} blockHtml - HTML of a single list-block
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>}
 */
function extractCategoryBlock(blockHtml, source) {
  const events = [];

  // Match each li.item within the block
  const itemRegex = /<li\b[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)(?=<li\b[^>]*class="[^"]*item[^"]*"|<\/ul>|<\/div>\s*<\/div>\s*$)/gi;
  let match;

  while ((match = itemRegex.exec(blockHtml)) !== null) {
    const item = match[0];

    // Title: div.title inside div.info
    const titleMatch = item.match(/<div\b[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i);
    if (!titleMatch) continue;
    const title = cleanTitle(titleMatch[1]);
    if (!title) continue;

    // Detail URL: a[href^="/activity/"]
    const urlMatch = item.match(/<a\b[^>]*href="(\/activity\/\d+)"[^>]*>/i);
    const signupUrl = urlMatch
      ? absoluteUrl(BASE_URL, urlMatch[1])
      : source.url;

    // Date: div.time (only present in category-block items)
    const dateMatch = item.match(/<div\b[^>]*class="[^"]*time[^"]*"[^>]*>([^<]+)<\/div>/i);
    if (!dateMatch) continue;

    const range = parseDateRange(dateMatch[1].trim());
    if (!range?.start_time) continue;

    // Venue: div.venue or a[href^="/venue/"] div.venue
    const venueMatch = item.match(/<div\b[^>]*class="[^"]*venue[^"]*"[^>]*>([^<]+)<\/div>/i);
    const venue = venueMatch
      ? decodeHtml(venueMatch[1]).trim()
      : "上海";

    const event = buildEvent({
      title,
      start_time: range.start_time,
      end_time: range.end_time,
      venue,
      signup_url: signupUrl,
      source,
    });

    if (event) events.push(event);
  }

  return events;
}

/**
 * Parse Piaoniu ticketing homepage.
 *
 * The page (https://www.piaoniu.com/) is server-rendered with
 * performance listings organized by category. Two block types exist:
 *
 * 1. category-block — rich cards with title, date, venue, price
 *    (演唱会, 体育赛事, 话剧歌剧, 休闲展览)
 * 2. category-list — compact cards with only title and price
 *    (音乐会, 戏曲综艺, 舞蹈芭蕾, 儿童亲子, 潮生活)
 *    These are skipped because they have no dates.
 *
 * @param {string} html - Homepage HTML
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>} Parsed events
 */
export function parsePiaoniu(html, source) {
  const events = [];

  // Match each category-block section (the ones with dates/venues)
  const blockRegex = /<div\b[^>]*class="[^"]*list-block\s+category-block[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*class="[^"]*list-block\b|$)/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const blockEvents = extractCategoryBlock(match[0], source);
    events.push(...blockEvents);
  }

  return uniqueBy(
    events,
    (e) => `${e.title}|${e.start_time}`,
  );
}
