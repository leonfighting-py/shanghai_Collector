import { defaultFetchHtml } from "../fetch-html.js";
import { parseChineseEventDateRange, parseChineseEventTime } from "../wechat-date-parser.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags, uniqueBy } from "./shared.js";

const ARTICLE_PATH = /\/xiuxian\/\d+\/\d+\.shtm/i;

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

function extractArticleBody(html) {
  const contentMatch =
    html.match(/<div class="content[^"]*"[^>]*>([\s\S]*?)<div class="daofen"/i) ||
    html.match(/<div class="article[^"]*"[^>]*>([\s\S]*?)<div class="daofen"/i);
  return stripTags(contentMatch?.[1] || html);
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

export function extractEventsFromBendibaoArticle(html, { source, url }) {
  const pageTitle = extractPageTitle(html);
  const publishTime = extractPublishTime(html);
  const body = extractArticleBody(html);
  const events = [];
  const seen = new Set();

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

export async function parseBendibaoShanghai(html, source, { fetchHtml = defaultFetchHtml, maxLinks = 12 } = {}) {
  const links = collectBendibaoArticleLinks(html, source.url, { maxLinks });

  if (links.length === 0) return [];

  const batches = await mapWithLimit(links, 3, async (href) => {
    try {
      const detail = await fetchHtml(href);
      return extractEventsFromBendibaoArticle(detail, { source, url: href });
    } catch {
      return [];
    }
  });

  return uniqueBy(batches.flat(), (event) => `${event.title}|${event.start_time}|${event.signup_url}`);
}
