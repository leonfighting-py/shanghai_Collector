import { defaultFetchHtml } from "../fetch-html.js";
import { buildEvent, decodeHtml, mapWithLimit, stripTags, uniqueBy } from "./shared.js";

const LIST_URL = "http://www.minshengart.com/cn/index/exhibitions-and-events/exhibition";
const DETAIL_BASE = "http://www.minshengart.com/cn/category/exhibition-list/detail!";

/**
 * Parse date range patterns from body text.
 * Examples: "2026.07.17-12.06", "2026年7月17日–12月6日"
 */
function parseDetailDateRange(text) {
  if (!text) return { start_time: null, end_time: null };

  // Pattern: "2026.07.17-12.06"
  const dotRange = text.match(/(20\d{2})\.(\d{1,2})\.(\d{1,2})\s*[-–—~]\s*(\d{1,2})\.(\d{1,2})/);
  if (dotRange) {
    return {
      start_time: toShanghaiIso(dotRange[1], dotRange[2], dotRange[3]),
      end_time: toShanghaiIso(dotRange[1], dotRange[4], dotRange[5], 21),
    };
  }

  // Pattern: "2026年7月17日–12月6日"
  const cnRange = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[–—~\-]\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cnRange) {
    return {
      start_time: toShanghaiIso(cnRange[1], cnRange[2], cnRange[3]),
      end_time: toShanghaiIso(cnRange[1], cnRange[4], cnRange[5], 21),
    };
  }

  // Pattern: "2026年7月17日–2026年12月6日" (full dates)
  const cnFull = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[–—~\-]\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cnFull) {
    return {
      start_time: toShanghaiIso(cnFull[1], cnFull[2], cnFull[3]),
      end_time: toShanghaiIso(cnFull[4], cnFull[5], cnFull[6], 21),
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
 * Extract current/upcoming exhibition slugs from the listing page.
 * Recent exhibitions are typically listed first.
 */
function extractExhibitionSlugs(html, { maxExhibitions = 6 } = {}) {
  const slugs = [];
  const slugPattern = /detail!([a-z0-9\-_]+(?:-[a-z0-9\-_]+)*)/gi;
  let match;

  while ((match = slugPattern.exec(html)) !== null) {
    const slug = match[1];
    if (slug.length < 5) continue;
    if (!slugs.includes(slug)) slugs.push(slug);
  }

  return slugs.slice(0, maxExhibitions);
}

/**
 * Parse a detail page and return raw exhibition data.
 */
async function fetchDetailData(slug, { fetchHtml = defaultFetchHtml } = {}) {
  const url = `${DETAIL_BASE}${slug}`;
  try {
    const html = await fetchHtml(url);

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const fullTitle = titleMatch ? decodeHtml(titleMatch[1]) : "";
    const title = fullTitle.replace(/\s*\|\s*上海民生现代美术馆\s*$/i, "").trim();
    if (!title || title.length < 4) return null;

    const bodyText = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

    const { start_time, end_time } = parseDetailDateRange(bodyText.slice(0, 2000));
    if (!start_time) return null;

    const venueMatch = bodyText.match(/地点\s+([^ ]{2,40}(?:博物馆|美术馆|艺术馆|艺术中心|画廊))/);
    const venue = venueMatch ? venueMatch[1].trim() : "上海民生现代美术馆";

    return { title, start_time, end_time, venue, url };
  } catch {
    return null;
  }
}

/**
 * Parse exhibitions from 上海民生现代美术馆.
 */
export async function parseMinshengArt(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const slugs = extractExhibitionSlugs(html);
  if (slugs.length === 0) return [];

  const dataList = await mapWithLimit(slugs, 2, async (slug) => {
    return fetchDetailData(slug, { fetchHtml });
  });

  const events = dataList.filter(Boolean).map((data) =>
    buildEvent({
      title: data.title,
      start_time: data.start_time,
      end_time: data.end_time,
      venue: data.venue,
      signup_url: data.url,
      source,
    }),
  );

  return uniqueBy(
    events.filter(Boolean),
    (event) => `${event.title}|${event.start_time}`,
  );
}
