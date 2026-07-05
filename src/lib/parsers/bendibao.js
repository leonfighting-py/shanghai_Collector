import { defaultFetchHtml } from "../fetch-html.js";
import { parseChineseEventDateRange, parseChineseEventTime } from "../wechat-date-parser.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags, uniqueBy } from "./shared.js";

const ARTICLE_PATH = /\/(?:xiuxian|tour)\/\d+\/\d+\.shtm/i;
const CAPTCHA_HINT = /拼图验证|滑动验证|验证以继续访问/;

export function isBendibaoBlocked(html) {
  return typeof html === "string" && html.length < 5000 && CAPTCHA_HINT.test(html);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferReferenceYear(publishTime) {
  if (publishTime) {
    const year = new Date(String(publishTime).replace(" ", "T") + "+08:00").getFullYear();
    if (year >= 2020 && year <= 2100) return year;
  }
  return new Date().getFullYear();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toShanghaiIso(year, month, day, hour = 10, minute = 0) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(`${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return date.toISOString();
}

export function parseBendibaoDateRange(text, publishTime) {
  if (!text?.trim()) return null;
  const normalized = text.replace(/[—–~～]/g, "-").replace(/\s+/g, " ").trim();
  const refYear = inferReferenceYear(publishTime);

  const dotRange = normalized.match(/^(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})$/);
  if (dotRange) {
    return {
      start_time: toShanghaiIso(refYear, dotRange[1], dotRange[2]),
      end_time: toShanghaiIso(refYear, dotRange[3], dotRange[4], 21, 0),
    };
  }

  const sameMonthRange = normalized.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*-\s*(\d{1,2})\s*日$/);
  if (sameMonthRange) {
    return {
      start_time: toShanghaiIso(refYear, sameMonthRange[1], sameMonthRange[2]),
      end_time: toShanghaiIso(refYear, sameMonthRange[1], sameMonthRange[3], 21, 0),
    };
  }

  const crossMonthRange = normalized.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*-\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);
  if (crossMonthRange) {
    return {
      start_time: toShanghaiIso(refYear, crossMonthRange[1], crossMonthRange[2]),
      end_time: toShanghaiIso(refYear, crossMonthRange[3], crossMonthRange[4], 21, 0),
    };
  }

  const prefixed = normalized.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*-\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);
  if (prefixed) {
    return {
      start_time: toShanghaiIso(prefixed[1], prefixed[2], prefixed[3]),
      end_time: toShanghaiIso(prefixed[1], prefixed[4], prefixed[5], 21, 0),
    };
  }

  return parseChineseEventDateRange(normalized, { publishTime });
}

function cleanBendibaoTitle(raw = "") {
  return raw
    .replace(/活动攻略.*$/i, "")
    .replace(/活动汇总.*$/i, "")
    .replace(/（[^）]{0,30}时间[^）]{0,30}）/g, "")
    .replace(/\([^)]{0,30}时间[^)]{0,30}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBendibaoVenue(raw = "") {
  return raw
    .split(/[，,。；;\n]/)[0]
    .replace(/\s+(?:期间|详见|活动|内容|特色|门票|预约|报名|开放).*$/, "")
    .replace(/公园开放时间[:：].*$/i, "")
    .replace(/详见正文.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Strip HTML tags but preserve paragraph breaks (unlike shared.stripTags
 * which collapses all whitespace). Used for articles where events are
 * separated by <p> boundaries rather than full-width punctuation.
 */
function stripTagsKeepBreaks(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

function extractArticleBody(html) {
  const contentMatch =
    html.match(/<div class="content[^"]*"[^>]*>([\s\S]*?)<div class="daofen"/i) ||
    html.match(/<div class="article[^"]*"[^>]*>([\s\S]*?)<div class="daofen"/i);
  if (contentMatch) return stripTags(contentMatch[1]);

  // Fallback: locate content div and slice out of the page,
  // stopping at common footer markers. Preserve <p> / <br>
  // boundaries so the downstream paragraph-based regex can
  // distinguish individual event blocks.
  const contentStart = html.indexOf('<div class="content');
  if (contentStart >= 0) {
    const markers = ['推荐阅读', '温馨提示：', 'class="page"', 'class="art_crumb"'];
    let endIdx = html.length;
    for (const marker of markers) {
      const idx = html.indexOf(marker, contentStart + 100);
      if (idx > 0 && idx < endIdx) endIdx = idx;
    }
    return stripTagsKeepBreaks(html.slice(contentStart, endIdx));
  }

  return stripTags(html);
}

function extractPublishTime(html) {
  const match = html.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
  return match?.[1] || null;
}

function extractPageTitle(html) {
  const topTitle = html.match(/class="top-title"[^>]*>([\s\S]*?)<\//i)?.[1];
  if (topTitle) return cleanBendibaoTitle(stripTags(topTitle));
  const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  return cleanBendibaoTitle(stripTags(titleTag).replace(/-?\s*上海本地宝.*$/i, ""));
}

/**
 * Extract events from roundup tables (名称 | 时间 | 地点), used by
 * 快闪汇总 / 商场活动汇总 style articles.
 */
export function extractEventsFromBendibaoTable(html, { source, url, publishTime }) {
  const events = [];

  for (const tableMatch of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...tableMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rows.length < 2) continue;

    const headerCells = [...rows[0][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      stripTags(cell[1]).trim(),
    );
    const nameIdx = headerCells.findIndex((cell) => /名称|活动/.test(cell));
    const timeIdx = headerCells.findIndex((cell) => /时间/.test(cell));
    const venueIdx = headerCells.findIndex((cell) => /地点|地址/.test(cell));
    if (nameIdx < 0 || timeIdx < 0 || venueIdx < 0) continue;

    for (const row of rows.slice(1)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
        stripTags(cell[1]).trim(),
      );
      if (cells.length <= Math.max(nameIdx, timeIdx, venueIdx)) continue;

      const title = cells[nameIdx];
      const range = parseBendibaoDateRange(cells[timeIdx], publishTime);
      if (!title || !range?.start_time) continue;

      const event = buildEvent({
        title,
        start_time: range.start_time,
        end_time: range.end_time,
        venue: cells[venueIdx] || "上海",
        signup_url: url,
        source,
      });
      if (event) events.push(event);
    }
  }

  return events;
}

/**
 * Extract events from articles where each event is a numbered section
 * (一、二、… / 1、2、…) with its own title, time, and venue lines.
 * Used for /tour/ roundup articles that don't fit the simpler paragraph
 * regex in the main extractor.
 */
function extractEventsFromNumberedSections(body, { source, url, publishTime, seen }) {
  const events = [];
  // Split at section-number boundaries
  const sections = body.split(/\n(?=[一二三四五六七八九十\d]+[、.)）])/);

  for (const section of sections) {
    const firstLine = section.split("\n")[0];
    const titleMatch = firstLine.match(/^[一二三四五六七八九十\d]+[、.)）]\s*(.+)/);
    if (!titleMatch) continue;
    const title = cleanBendibaoTitle(titleMatch[1]);
    if (!title || title.length < 2) continue;

    // Within this section, look for time & venue on their own lines
    const timeMatch = section.match(/(?:活动)?时间[：:]\s*([^\n。；]{2,40})/);
    const venueMatch = section.match(/(?:活动)?地点[：:]\s*([^\n。；]{2,60})/);
    if (!timeMatch || !venueMatch) continue;

    const range = parseBendibaoDateRange(timeMatch[1].trim(), publishTime);
    if (!range?.start_time) continue;

    const key = `${title}|${range.start_time}|${venueMatch[1].trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const event = buildEvent({
      title,
      start_time: range.start_time,
      end_time: range.end_time,
      venue: cleanBendibaoVenue(venueMatch[1].trim()) || "上海",
      signup_url: url,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}

export function extractEventsFromBendibaoArticle(html, { source, url }) {
  const pageTitle = extractPageTitle(html);
  const publishTime = extractPublishTime(html);
  const body = extractArticleBody(html);
  const events = [];
  const seen = new Set();

  for (const tableEvent of extractEventsFromBendibaoTable(html, { source, url, publishTime })) {
    const key = `${tableEvent.title}|${tableEvent.start_time}|${tableEvent.venue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(tableEvent);
  }

  function pushEvent({ title, dateText, timeText, venueText }) {
    const range = parseBendibaoDateRange(dateText, publishTime);
    if (!range?.start_time || !title) return;

    let start_time = range.start_time;
    if (timeText) {
      const { hour, minute } = parseChineseEventTime(timeText);
      const date = new Date(range.start_time);
      const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const iso = toShanghaiIso(
        shanghai.getUTCFullYear(),
        shanghai.getUTCMonth() + 1,
        shanghai.getUTCDate(),
        hour,
        minute,
      );
      if (iso) start_time = iso;
    }

    const key = `${title}|${start_time}|${venueText || ""}`;
    if (seen.has(key)) return;
    seen.add(key);

    const event = buildEvent({
      title: cleanBendibaoTitle(title),
      start_time,
      end_time: range.end_time,
      venue: cleanBendibaoVenue(venueText) || "上海",
      signup_url: url,
      source,
    });
    if (event) events.push(event);
  }

  // --- existing paragraph-based regex extraction ---
  const mainMatch = body.match(
    /(?:活动)?时间[：:]\s*([^。；\n地点]{2,40}?)(?:活动)?地点[：:]\s*([^。；\n]{2,60})/,
  );
  if (mainMatch) {
    pushEvent({
      title: pageTitle,
      dateText: mainMatch[1],
      venueText: mainMatch[2],
    });
  }

  for (const match of body.matchAll(
    /(?:^|[。；\n])\s*(?:[一二三四五六七八九十\d]+[、.)）]?\s*)?(?:[^。；\n]{0,24}[：:])?\s*(?:活动)?时间[：:]\s*([^。；\n地点]{2,40}?)(?:活动)?地点[：:]\s*([^。；\n]{2,60})/g,
  )) {
    const sectionStart = Math.max(0, match.index - 80);
    const sectionPrefix = body.slice(sectionStart, match.index);
    const heading =
      sectionPrefix.match(/([^。；\n]{2,28}[：:])\s*$/)?.[1]?.replace(/[：:]\s*$/, "") ||
      sectionPrefix.match(/[「《]([^」》]{2,30})[」》]/)?.[1] ||
      pageTitle;

    pushEvent({
      title: heading.includes("时间") ? pageTitle : heading,
      dateText: match[1],
      venueText: match[2],
    });
  }

  // --- numbered-section extraction for /tour/ roundup articles ---
  // Trigger when the paragraph regex picked up few events but the body
  // contains clear section-number markers (一、/ 1、 etc.)
  if (events.length <= 2 && /[\n][一二三四五六七八九十\d]+[、.)）]/.test(body)) {
    const sectionEvents = extractEventsFromNumberedSections(body, {
      source,
      url,
      publishTime,
      seen,
    });
    events.push(...sectionEvents);
  }

  if (events.length === 0 && pageTitle) {
    const titleDate = pageTitle.match(/(20\d{2})\s*年?\s*(\d{1,2})\s*月/);
    if (titleDate) {
      pushEvent({
        title: pageTitle,
        dateText: `${titleDate[1]}年${titleDate[2]}月`,
        venueText: "上海",
      });
    } else {
      const fallbackDate = parseBendibaoDateRange(body.slice(0, 500), publishTime);
      if (fallbackDate?.start_time) {
        pushEvent({
          title: pageTitle,
          dateText: body.slice(0, 500),
          venueText: extractVenueHint(body) || "上海",
        });
      }
    }
  }

  return events;
}

function extractVenueHint(body) {
  const venueMatch = body.match(/(?:活动)?地点[：:]\s*([^。；\n]{2,40})/);
  return venueMatch ? cleanBendibaoVenue(venueMatch[1]) : null;
}

export function collectBendibaoArticleLinks(html, baseUrl, { maxLinks = 12 } = {}) {
  const links = [];
  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    const href = absoluteUrl(baseUrl, match[1]);
    if (!href || !ARTICLE_PATH.test(href)) continue;
    links.push(href);
  }
  return uniqueBy(links, (href) => href).slice(0, maxLinks);
}

async function fetchArticlesPolitely(links, { fetchHtml, source, delayMs = 400 }) {
  const batches = [];
  for (const href of links) {
    try {
      const detail = await fetchHtml(href);
      if (isBendibaoBlocked(detail)) break; // rate-limited: stop hammering, keep what we have
      batches.push(extractEventsFromBendibaoArticle(detail, { source, url: href }));
    } catch {
      // skip failed article
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return batches.flat();
}

export async function parseBendibaoShanghai(html, source, { fetchHtml = defaultFetchHtml, maxLinks = 12 } = {}) {
  if (isBendibaoBlocked(html)) {
    throw new Error("bendibao anti-bot captcha triggered");
  }
  const links = collectBendibaoArticleLinks(html, source.url, { maxLinks });

  if (links.length === 0) return [];

  const events = await fetchArticlesPolitely(links, { fetchHtml, source });

  return uniqueBy(events, (event) => `${event.title}|${event.start_time}|${event.signup_url}`);
}

/**
 * Parser for a pinned roundup article (e.g. 商场活动汇总/快闪汇总 with a stable URL):
 * extracts events from the article itself, then follows its linked articles
 * (相关推荐 usually points at the monthly 快闪汇总).
 */
export async function parseBendibaoRoundup(html, source, { fetchHtml = defaultFetchHtml, maxLinks = 6 } = {}) {
  if (isBendibaoBlocked(html)) {
    throw new Error("bendibao anti-bot captcha triggered");
  }
  const own = extractEventsFromBendibaoArticle(html, { source, url: source.url });

  const links = collectBendibaoArticleLinks(html, source.url, { maxLinks }).filter(
    (href) => href !== source.url,
  );
  const linked = await fetchArticlesPolitely(links, { fetchHtml, source });

  return uniqueBy([...own, ...linked], (event) => `${event.title}|${event.start_time}|${event.venue}`);
}
