import { buildEvent, decodeHtml, absoluteUrl, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.china-drama.com/";
const VENUE = "上海话剧艺术中心";

/**
 * Parse a Chinese date string like "2016年4月9日" into Shanghai ISO.
 *
 * @param {string} text
 * @returns {string|null}
 */
function parseChineseDate(text) {
  const match = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!match) return null;
  return toShanghaiIso(match[1], match[2], match[3]);
}

/**
 * Build an ISO 8601 datetime in Shanghai timezone.
 *
 * @param {number|string} year
 * @param {number|string} month
 * @param {number|string} day
 * @param {number} [hour=10]
 * @returns {string|null}
 */
function toShanghaiIso(year, month, day, hour = 10) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, "0");
  const d = String(Number(day)).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const date = new Date(`${y}-${m}-${d}T${h}:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y) return null;
  return `${y}-${m}-${d}T${h}:00:00+08:00`;
}

/**
 * Parse Shanghai Dramatic Arts Centre homepage.
 *
 * NOTE: The homepage (https://www.china-drama.com/) is a JS-rendered
 * page where performance listings are populated dynamically by
 * index2.js. The static HTML contains only the page shell and
 * HTML-commented template examples. The actual performance listing
 * page is play.html (剧目介绍).
 *
 * This parser attempts to extract events from the limited static
 * content available, including HTML comments, and gracefully returns
 * an empty array when nothing is found.
 *
 * @param {string} html - Homepage HTML
 * @param {{name: string, url: string, category: string, locale: string}} source
 * @returns {Array<object>} Parsed events (typically empty for homepage)
 */
export function parseChinaDrama(html, source) {
  const events = [];

  // Uncomment HTML comments to access template content inside them
  const uncommented = html.replace(/<!--/g, "").replace(/-->/g, "");

  // Match news list items with titles that contain Chinese dates
  // Pattern: <li>...<h2>TITLE_WITH_DATE</h2>...</li>
  const newsItemRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = newsItemRegex.exec(uncommented)) !== null) {
    const block = match[1];
    const h2Match = block.match(/<h2>([^<]+)<\/h2>/i);
    if (!h2Match) continue;

    const titleRaw = decodeHtml(h2Match[1]);
    const start_time = parseChineseDate(titleRaw);
    if (!start_time) continue;

    // Skip cancellation / suspension notices
    if (/停演|取消|因故/.test(titleRaw)) continue;

    // Clean title: remove date suffix and status keywords
    const title = titleRaw
      .replace(/[(（]?20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日.*$/, "")
      .replace(/演出停演|节目征集|停演|取消/g, "")
      .trim();

    if (!title || title.length < 4) continue;

    const event = buildEvent({
      title,
      start_time,
      venue: VENUE,
      signup_url: absoluteUrl(BASE_URL, "play.html") || source.url,
      source,
    });

    if (event) events.push(event);
  }

  // Match media cards from the commented template
  // Pattern: <a href="..."><div class="idnexmediapart1">...<h2>TITLE</h2>...</div></a>
  const mediaRegex = /<div\b[^>]*class="idnexmediapart[12]"[^>]*>[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?<\/div>/gi;

  while ((match = mediaRegex.exec(uncommented)) !== null) {
    const title = decodeHtml(match[1]);
    if (!title || title.length < 4) continue;

    // Media cards have no dates in the static HTML — skip
    // They would need a detail page fetch to get dates
  }

  return uniqueBy(events, (e) => `${e.title}|${e.start_time}`);
}
