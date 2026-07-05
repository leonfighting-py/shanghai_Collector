import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.auroramuseum.cn";

/**
 * Parse date pattern "2026/07/07" to Shanghai ISO.
 */
function parseSlashDate(text) {
  if (!text) return null;
  const match = text.match(/(20\d{2})\/(\d{2})\/(\d{2})/);
  if (!match) return null;
  return toShanghaiIso(match[1], match[2], match[3]);
}

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
 * Extract event data from the Next.js RSC payload embedded in the HTML.
 *
 * The Aurora Museum is a React/Next.js SPA. Exhibition data (titles, dates)
 * is loaded dynamically via API calls and is NOT present in the static HTML.
 *
 * However, the homepage does embed some event/activity data in the RSC
 * payload under "博物馆动态" (Museum News). These are events like:
 *   - "AM KIDS" on 2026/07/04
 *   - "博物馆奇妙夜" on 2026/07/03
 *   - "白领之夜" on 2026/06/26
 *
 * Also, homeBanners data is embedded with exhibition page URLs and createTime.
 *
 * Event structure in the RSC payload:
 *   <div>2026/07/07 (周二)</div>
 *   <div>Event Title</div>
 *
 * @note This parser extracts museum events/activities, not exhibitions.
 *       Full exhibition data requires fetching the API endpoints
 *       (e.g., /zh/temporary-exhibitions).
 */
function extractEventsFromRSC(html) {
  const events = [];

  // Match event date + title pairs from the RSC payload
  // Pattern: date in format "2026/07/07 (周X)" followed by a title div
  const dateTitleRegex = /(20\d{2}\/\d{2}\/\d{2})\s*\([^)]*\)<\/div><div>([^<]{2,60})<\/div>/gi;
  let match;

  while ((match = dateTitleRegex.exec(html)) !== null) {
    const dateText = match[1];
    const title = decodeHtml(match[2]).trim();

    // Skip navigation/UI elements
    if (!title || title.length < 2) continue;

    const start_time = parseSlashDate(dateText);

    events.push({
      title,
      start_time,
      dateText,
    });
  }

  return events;
}

/**
 * Extract banner exhibition URLs from the embedded homeBanners JSON.
 * These provide exhibition page URLs but no titles/dates.
 */
function extractBannerExhibitionUrls(html) {
  const urls = [];
  // Extract linkUrl from banner data
  const bannerRegex = /"linkUrl":"(\/[^"]+)"/gi;
  let match;

  while ((match = bannerRegex.exec(html)) !== null) {
    const url = match[1];
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Parse events from 震旦博物馆 (Aurora Museum) homepage.
 *
 * IMPORTANT LIMITATION: This is a React/Next.js SPA. The static HTML
 * contains event/activity data (museum news) but NOT exhibition data
 * (titles, dates, venues for exhibits). Exhibition data is loaded
 * dynamically via API calls and requires JavaScript execution.
 *
 * What this parser extracts:
 * - Museum events/activities with dates (e.g., "白领之夜", "AM KIDS")
 * - Banner exhibition page URLs (without titles)
 */
export function parseAuroraMuseum(html, source) {
  const eventData = extractEventsFromRSC(html);
  if (eventData.length === 0) return [];

  const events = eventData
    .map((data) => {
      // Only process if we have both title and date
      if (!data.start_time) return null;

      return buildEvent({
        title: data.title,
        start_time: data.start_time,
        end_time: null,
        venue: "震旦博物馆",
        signup_url: BASE_URL,
        source,
      });
    })
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
