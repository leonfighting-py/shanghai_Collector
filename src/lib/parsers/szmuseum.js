import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.szmuseum.com";

/**
 * Parse date from Chinese exhibition date format.
 * Examples:
 *   "展览时间： 2026年7月01日（周三） - 10月10日（周六）"
 *   "展览时间： 2026年6月02日（周二） - 9月03日（周四）"
 */
function parseExhibitionDate(text) {
  if (!text) return { start_time: null, end_time: null };

  // Pattern: "2026年7月01日（...） - 10月10日（...）"
  const match = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日.*?[-–—~]\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (match) {
    const year = match[1];
    const startMonth = String(Number(match[2])).padStart(2, "0");
    const startDay = String(Number(match[3])).padStart(2, "0");
    const endMonth = String(Number(match[4])).padStart(2, "0");
    const endDay = String(Number(match[5])).padStart(2, "0");

    // If end month < start month, it spans into next year
    let endYear = year;
    if (Number(endMonth) < Number(startMonth)) {
      endYear = String(Number(year) + 1);
    }

    return {
      start_time: `${year}-${startMonth}-${startDay}T10:00:00+08:00`,
      end_time: `${endYear}-${endMonth}-${endDay}T21:00:00+08:00`,
    };
  }

  return { start_time: null, end_time: null };
}

/**
 * Extract exhibition cards from Suzhou Museum homepage.
 * Uses a position-based approach: find all <div class="slide"> openings
 * and extract content between consecutive ones.
 */
function extractSlides(html) {
  // Find the section2 containing the exhibitions
  const sectionMatch = html.match(/<div class="section section2">([\s\S]*?)<div class="section section3">/);
  if (!sectionMatch) return [];

  const sectionHtml = sectionMatch[1];
  const slides = [];

  // Find all positions of <div class="slide">
  const positions = [];
  const slidePattern = /<div class="slide">/g;
  let m;
  while ((m = slidePattern.exec(sectionHtml)) !== null) {
    positions.push(m.index);
  }

  // Extract content between consecutive slide tags
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length
      ? positions[i + 1]  // Next slide start
      : sectionHtml.indexOf('<a class="next"', start); // Or end of slider

    if (end < 0) continue;

    const block = sectionHtml.slice(start, end);

    // Extract title from span.title > first a
    const titleMatch = block.match(/<span class="title"[^>]*>[\s\S]*?<a[^>]*onclick="[^"]*"[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;

    const title = decodeHtml(titleMatch[1]);
    if (!title || title.length < 2) continue;

    // Extract date text from the "展览时间" anchor
    const dateMatch = block.match(/>\s*展览时间：\s*([^<]+)</);
    const dateText = dateMatch ? decodeHtml(dateMatch[1]) : "";

    // Get the detail page URL from onclick
    const urlMatch = block.match(/onclick="clickSlide\('[^']*','([^']+)'\)/);
    const detailUrl = urlMatch ? urlMatch[1] : "";

    slides.push({ title, dateText, detailUrl });
  }

  return slides;
}

/**
 * Parse exhibitions from 苏州博物馆 homepage.
 */
export function parseSuzhouMuseum(html, source) {
  const slides = extractSlides(html);
  if (slides.length === 0) return [];

  const events = slides
    .map((slide) => {
      const { start_time, end_time } = parseExhibitionDate(slide.dateText);
      if (!start_time) return null;

      const url = slide.detailUrl || BASE_URL;

      return buildEvent({
        title: slide.title,
        start_time,
        end_time,
        venue: "苏州博物馆",
        signup_url: url,
        source,
      });
    })
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
