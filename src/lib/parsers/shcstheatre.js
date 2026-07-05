import { buildEvent, decodeHtml, absoluteUrl, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.shcstheatre.com/Program/";

/**
 * Parse date range from shcstheatre listing format.
 * Examples:
 *   "2026.7.4-2026.7.5"
 *   "2026.07.30 - 08.01"
 *   "2026.8.14-2026.8.30"
 *
 * @param {string} dateText - Raw date text from the listing
 * @returns {{start_time: string|null, end_time: string|null}}
 */
function parseDateRange(dateText) {
  if (!dateText) return { start_time: null, end_time: null };

  // Pattern: "YYYY.M.D-YYYY.M.D" or "YYYY.MM.DD - MM.DD"
  const dotRange = dateText.match(
    /(20\d{2})\.(\d{1,2})\.(\d{1,2})\s*[-–—~]\s*(20\d{2})?\.?(\d{1,2})\.(\d{1,2})/,
  );
  if (dotRange) {
    const year1 = dotRange[1];
    const month1 = dotRange[2];
    const day1 = dotRange[3];
    const year2 = dotRange[4] || year1;
    const month2 = dotRange[5];
    const day2 = dotRange[6];
    return {
      start_time: toShanghaiIso(year1, month1, day1, 10),
      end_time: toShanghaiIso(year2, month2, day2, 21),
    };
  }

  return { start_time: null, end_time: null };
}

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
 * Parse time text like "14:00,19:30" and return the first time entry.
 *
 * @param {string} timeText
 * @returns {{hour: number, minute: number}}
 */
function parseFirstTime(timeText) {
  const first = timeText.match(/(\d{1,2}):(\d{2})/);
  if (first) {
    return { hour: parseInt(first[1], 10), minute: parseInt(first[2], 10) };
  }
  return { hour: 10, minute: 0 };
}

/**
 * Clean venue text by replacing &nbsp; and collapsing whitespace.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanVenue(raw) {
  return decodeHtml(raw)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract a single program card's metadata labels by matching known prefixes.
 *
 * @param {string} cardHtml - Inner HTML of a single program card
 * @returns {{date: string|null, time: string|null, venue: string|null}}
 */
function extractLabels(cardHtml) {
  const date = cardHtml.match(/日期[：:]\s*([^<]+)/i)?.[1]?.trim() || null;
  const time = cardHtml.match(/时间[：:]\s*([^<]+)/i)?.[1]?.trim() || null;
  const venue = cardHtml.match(/地点[：:]\s*([^<]+)/i)?.[1]?.trim() || null;
  return { date, time, venue };
}

/**
 * Parse Shanghai Culture Square Theater program listing page.
 *
 * The listing page at /Program/ProgramList.aspx renders program cards
 * server-side inside <div id="datarow">. Each card contains title, date,
 * venue, time, type, and price as labeled <li> entries.
 *
 * @param {string} html - Listing page HTML
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>} Parsed events
 */
export function parseShcstheatre(html, source) {
  const events = [];

  // Locate the datarow container — content between id="datarow"> and the
  // closing </div> that precedes the load-more / pagination sibling.
  const datarowMatch = html.match(
    /<div\b[^>]*id="datarow"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class="[^"]*load-more/i,
  );
  const datarow = datarowMatch ? datarowMatch[1] : null;
  if (!datarow) return [];

  // Split cards: each card starts with <div class='col-md-12 ... col12-no-paddiing'>
  // The first card uses "pad-top", later cards use "seperate-border-top".
  // Split on the opening tag boundary between cards.
  const cardBlocks = datarow.split(
    /<div\b[^>]*class='col-md-12\b[^']*col12-no-paddiing[^']*'\s*>/i,
  ).filter(Boolean);

  for (const card of cardBlocks) {
    // Title: inside .program-name > h2 > a (single-quoted attributes)
    const titleMatch = card.match(
      /class='program-name'[^>]*>[\s\S]*?<a\b[^>]*>([^<]+)<\/a>/i,
    );
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]);
    if (!title) continue;

    // Detail page URL (single-quoted href)
    const urlMatch = card.match(
      /<a\b[^>]*href='(ProgramDetails\.aspx\?[^']+)'/i,
    );
    const signupUrl = urlMatch
      ? absoluteUrl(BASE_URL, urlMatch[1])
      : source.url;

    // Extract labeled metadata
    const dateMatch = card.match(/日期[：:]\s*([^<]+)/i);
    const timeMatch = card.match(/时间[：:]\s*([^<]+)/i);
    const venueMatch = card.match(/地点[：:]\s*([^<]+)/i);

    const date = dateMatch?.[1]?.trim() || null;
    const time = timeMatch?.[1]?.trim() || null;
    const venueRaw = venueMatch?.[1]?.trim() || null;

    // Parse date range
    const range = parseDateRange(date);
    if (!range?.start_time) continue;

    // Apply parsed time to start_time if available
    let start_time = range.start_time;
    if (time) {
      const { hour, minute } = parseFirstTime(time);
      const dateParts = range.start_time.match(
        /(20\d{2})-(\d{2})-(\d{2})/,
      );
      if (dateParts) {
        const updated = toShanghaiIso(
          dateParts[1],
          dateParts[2],
          dateParts[3],
          hour,
          minute,
        );
        if (updated) start_time = updated;
      }
    }

    const venueName = venueRaw
      ? cleanVenue(venueRaw).replace(/^地点[：:]\s*/, "")
      : "上海文化广场";

    const event = buildEvent({
      title,
      start_time,
      end_time: range.end_time,
      venue: venueName,
      signup_url: signupUrl,
      source,
    });

    if (event) events.push(event);
  }

  return uniqueBy(
    events,
    (e) => `${e.title}|${e.start_time}`,
  );
}
