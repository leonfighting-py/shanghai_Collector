import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "http://www.thelongmuseum.org";

/**
 * Parse a dot-separated date range like "2026.5.30－2026.8.30".
 * Uses full-width dash (U+FF0D) or half-width dash/hyphen.
 */
function parseDotDateRange(text) {
  if (!text) return { start_time: null, end_time: null };

  const match = text.match(
    /(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[－–—-]\s*(?:(\d{4})\.)?(\d{1,2})\.(\d{1,2})/,
  );
  if (!match) return { start_time: null, end_time: null };

  const year = match[1];
  const sMonth = match[2];
  const sDay = match[3];
  const eYear = match[4] || year;
  const eMonth = match[5];
  const eDay = match[6];

  return {
    start_time: toShanghaiIso(year, sMonth, sDay),
    end_time: toShanghaiIso(eYear, eMonth, eDay, 21),
  };
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
 * Extract exhibition data from the homepage carousel.
 *
 * Carousel structure:
 *   <ol class="carousel-indicators">
 *     <li data-slide-to="0"><a href="/exhibition-369/detail-2010.html">查看详情</a></li>
 *   </ol>
 *   <div class="carousel-inner">
 *     <div class="item active">
 *       <div class="item-title-left">
 *         <h1>Title</h1>
 *         <h2>2026.5.30－2026.8.30<br>Venue</h2>
 *       </div>
 *     </div>
 *   </div>
 */
function extractCarouselItems(html) {
  // Extract detail URLs from indicators
  const urls = [];
  const indicatorRegex = /<li[^>]*data-slide-to="\d+"[^>]*>\s*<a\s+href="(\/[^"]+)"/gi;
  let imatch;
  while ((imatch = indicatorRegex.exec(html)) !== null) {
    urls.push(imatch[1]);
  }

  // Extract items from carousel
  const items = [];
  const itemRegex = /<div\s+class="item-title-left">([\s\S]*?)<\/div>\s*(?:<\/font>)?/gi;
  let match;
  let idx = 0;

  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);

    if (!titleMatch || !h2Match) continue;

    const title = decodeHtml(titleMatch[1]).trim();
    const h2Content = h2Match[1];

    // Split h2: date before <br>, venue after <br>
    const parts = h2Content.split(/<br\s*\/?>/i);
    const dateText = parts[0] ? decodeHtml(parts[0]).trim() : "";
    const venueText = parts[1] ? decodeHtml(parts[1]).trim() : "龙美术馆";

    const { start_time, end_time } = parseDotDateRange(dateText);
    const signup_url = urls[idx] ? `${BASE_URL}${urls[idx]}` : BASE_URL;

    if (title && start_time) {
      items.push({ title, start_time, end_time, venue: venueText, signup_url });
    }
    idx++;
  }

  return items;
}

/**
 * Parse exhibitions from 龙美术馆 (Long Museum) homepage.
 */
export function parseLongMuseum(html, source) {
  const items = extractCarouselItems(html);
  if (items.length === 0) return [];

  const events = items
    .map((item) =>
      buildEvent({
        title: item.title,
        start_time: item.start_time,
        end_time: item.end_time,
        venue: item.venue,
        signup_url: item.signup_url,
        source,
      }),
    )
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
