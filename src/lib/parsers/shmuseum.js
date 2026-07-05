import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.shanghaimuseum.net/mu/";

/**
 * Parse date range "2026-06-26~2026-10-07".
 */
function parseTildeDateRange(text) {
  if (!text) return { start_time: null, end_time: null };

  const match = text.match(
    /(20\d{2})-(\d{2})-(\d{2})\s*[~～]\s*(20\d{2})-(\d{2})-(\d{2})/,
  );
  if (!match) return { start_time: null, end_time: null };

  return {
    start_time: toShanghaiIso(match[1], match[2], match[3]),
    end_time: toShanghaiIso(match[4], match[5], match[6], 21),
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
 * Check if a swiper slide content block looks like an exhibition
 * (has a title, date range, and venue).
 */
function isExhibitionSlide(block) {
  // Must have a date range pattern like 2026-06-26~2026-10-07
  if (!/(20\d{2})-(\d{2})-(\d{2})\s*[~～]\s*(20\d{2})-(\d{2})-(\d{2})/.test(block)) {
    return false;
  }
  // Must have a title
  if (!/<p class="title"/.test(block)) return false;
  return true;
}

/**
 * Extract exhibition data from the homepage swiper slides.
 *
 * Structure:
 *   <div class="swiper-slide">
 *     <img class="big-pic">
 *     <div class="content">
 *       <div>
 *         <p class="title">Exhibition Name</p>
 *         <p>2026-06-26~2026-10-07</p>
 *         <p>Venue</p>
 *       </div>
 *       <div>
 *         <a href="frontend/pg/article/id/E00004247">详情</a>
 *       </div>
 *     </div>
 *   </div>
 *
 * Some slides are not exhibitions (visit info, collection highlights).
 * We filter those out.
 */
function extractSwiperExhibitions(html) {
  const exhibitions = [];

  // Match each swiper-slide with a content div
  const slideRegex = /<div\s+class="swiper-slide"[^>]*>([\s\S]*?)<\/div>\s*(?=<div\s+class="swiper-slide"|<\/div>\s*<\/div>\s*<div\s+class="swiper-pagination)/gi;
  let match;

  while ((match = slideRegex.exec(html)) !== null) {
    const slide = match[1];

    // Find the content div within the slide
    const contentMatch = slide.match(
      /<div\s+class="content">([\s\S]*?)<\/div>\s*(?=<a\s+href="upload|<img src="upload|$)/i,
    );
    if (!contentMatch) continue;

    const content = contentMatch[1];

    // Check if this looks like an exhibition
    if (!isExhibitionSlide(content)) continue;

    // Extract title
    const titleMatch = content.match(
      /<p\s+class="title">([^<]+)<\/p>/i,
    );
    if (!titleMatch) continue;
    const title = decodeHtml(titleMatch[1]).trim();

    // Extract all <p> tags in the content
    const pMatches = content.match(/<p>([\s\S]*?)<\/p>/gi);
    if (!pMatches || pMatches.length < 2) continue;

    // First <p> after title should be the date
    // The title <p> has class="title", subsequent <p> are plain
    const dateMatch = content.match(
      /<p\s+class="title">[^<]*<\/p>\s*<p>([\s\S]*?)<\/p>/i,
    );
    const dateText = dateMatch ? decodeHtml(dateMatch[1]).trim() : "";

    // Second <p> after title should be the venue
    const venueMatch = content.match(
      /<p\s+class="title">[^<]*<\/p>\s*<p>[^<]*<\/p>\s*<p>([\s\S]*?)<\/p>/i,
    );
    const venueText = venueMatch ? decodeHtml(venueMatch[1]).trim() : "上海博物馆";

    // Extract detail URL
    const urlMatch = content.match(
      /<a\s+href="(frontend\/pg\/article\/id\/[^"]+)"[^>]*>.*?详\s*情.*?<\/a>/i,
    );
    const signup_url = urlMatch ? `${BASE_URL}${urlMatch[1]}` : BASE_URL;

    const { start_time, end_time } = parseTildeDateRange(dateText);

    if (title && start_time) {
      exhibitions.push({
        title,
        start_time,
        end_time,
        venue: venueText,
        signup_url,
      });
    }
  }

  return exhibitions;
}

/**
 * Parse exhibitions from 上海博物馆 (Shanghai Museum) homepage.
 */
export function parseShanghaiMuseum(html, source) {
  const items = extractSwiperExhibitions(html);
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
