import { buildEvent, stripTags, uniqueBy } from "./shared.js";

const BASE = "https://www.wbmshanghai.com";

/**
 * Parse a dot-separated date range into ISO strings.
 * Formats: "2026.04.17-08.02", "2025.04.29-2026.10.18"
 */
function parseDotDateRange(text) {
  if (!text?.trim()) return { start_time: null, end_time: null };

  // Cross-year: "2025.04.29-2026.10.18"
  const crossYear = text.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[-–—~]\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (crossYear) {
    return {
      start_time: toShanghaiIso(crossYear[1], crossYear[2], crossYear[3]),
      end_time: toShanghaiIso(crossYear[4], crossYear[5], crossYear[6], 21),
    };
  }

  // Same-year: "2026.04.17-08.02"
  const sameYear = text.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[-–—~]\s*(\d{1,2})\.(\d{1,2})/);
  if (sameYear) {
    return {
      start_time: toShanghaiIso(sameYear[1], sameYear[2], sameYear[3]),
      end_time: toShanghaiIso(sameYear[1], sameYear[4], sameYear[5], 21),
    };
  }

  return { start_time: null, end_time: null };
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
 * Parse current and upcoming exhibitions from 西岸美术馆 (West Bund Museum).
 *
 * The page is Vue SSR — exhibition cards are rendered server-side with:
 *   <a href="/zh-hans/exhibition/..." class="h-full">
 *     <div class="t-h6-120">Title</div>
 *     <time class="t-sub2">2026.04.17-08.02</time>
 *   </a>
 *
 * We split on the card link pattern and extract title + date from each card.
 */
export function parseWestBundMuseum(html, source, { now = new Date() } = {}) {
  const events = [];

  // Split into individual exhibition card blocks
  const cardPattern = /<a\s+href="(\/zh-hans\/exhibition\/[^"]*)"\s+class="h-full"([\s\S]*?)<\/a>/gi;
  let cardMatch;

  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const href = cardMatch[1];
    const block = cardMatch[2];

    // Extract title from <div class="t-h6-120">
    const titleMatch = block.match(/<div\s+class="t-h6-120"[^>]*>([^<]+)<\/div>/);
    if (!titleMatch) continue;

    const title = stripTags(titleMatch[1]).trim();
    if (!title || title.length < 2) continue;

    // Extract date from <time class="t-sub2">
    const timeMatch = block.match(/<time\s+class="t-sub2"[^>]*>([^<]+)<\/time>/);
    if (!timeMatch) continue;

    const { start_time, end_time } = parseDotDateRange(timeMatch[1].trim());
    if (!start_time) continue;

    // Extract gallery room info as venue hint
    const roomMatch = block.match(/<div\s+class="t-overline"[^>]*>([^<]+)<\/div>/);
    const venue = roomMatch ? `西岸美术馆 ${roomMatch[1].trim()}` : "西岸美术馆";

    const event = buildEvent({
      title,
      start_time,
      end_time,
      venue,
      signup_url: `${BASE}${href}`,
      source,
    });

    if (event) events.push(event);
  }

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
