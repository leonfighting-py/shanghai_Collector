import { buildEvent, decodeHtml, stripTags, uniqueBy } from "./shared.js";

/**
 * Keywords that indicate a new store opening or brand first-store event.
 */
const STORE_OPENING_KEYWORDS = /开店|首店|新店|入驻|开业|落地|快闪|首家|首座|首进|新开|开幕|启幕|正式营业|试营业|开张/;

/**
 * Non-store-opening keywords that should be excluded even if they match the above.
 * These are policy announcements, financial news, etc.
 */
const EXCLUDE_KEYWORDS = /通知|政策|通知单|申报指南|资金|补贴|批复|REITs|ABS|债券|审核|受理|发改委|商务委|财政局|人民政府/;

/**
 * Parse a Chinese date string into Shanghai ISO format.
 * Handles: "2026年6月26日", "6月26日", "7月3日", "2026-06-24"
 */
function parseDate(text, fallbackYear = new Date().getFullYear()) {
  if (!text) return null;

  // "2026年6月26日"
  const fullCn = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (fullCn) {
    return toShanghaiIso(fullCn[1], fullCn[2], fullCn[3]);
  }

  // "6月26日"
  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (monthDay) {
    return toShanghaiIso(fallbackYear, monthDay[1], monthDay[2]);
  }

  // "2026-06-24"
  const isoDate = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return toShanghaiIso(isoDate[1], isoDate[2], isoDate[3]);
  }

  return null;
}

/**
 * Guess the fallback year from a publish date string.
 */
function inferYear(publishDate) {
  if (!publishDate) return new Date().getFullYear();
  const year = new Date(publishDate).getFullYear();
  if (year >= 2020 && year <= 2100) return year;
  return new Date().getFullYear();
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
 * Extract a venue name from news description text.
 * Looks for location patterns like "坐落于...", "位于...", "在...开业", city names.
 */
function extractVenue(text) {
  if (!text) return null;

  // "坐落于XXX" or "位于XXX"
  const located = text.match(/(?:坐落于|位于|择址|落址|落地)(.{2,30}?)(?:，|。|、|$|\s)/);
  if (located) return located[1].trim();

  // City + specific location: "上海安福路", "成都太古里", "深圳罗湖宝安南路"
  const cityLoc = text.match(/(上海|北京|广州|深圳|成都|杭州|南京|武汉|重庆|西安|厦门|济南|无锡|东莞|福州|长沙|宁波|苏州|天津|沈阳|郑州|青岛)(.{2,25}?)(?:，|。|、|正式|已经|开业|启幕|迎客|$|\s)/);
  if (cityLoc) return (cityLoc[1] + cityLoc[2]).trim();

  // "XX门店坐落于XXX"
  const venueNear = text.match(/(?:距离|紧邻|毗邻|靠近|邻近)(.{2,25}?)(?:，|。|、|仅|$)/);
  if (venueNear) return venueNear[1].trim();

  // "位于XX的" pattern
  const inPattern = text.match(/在\s*(.{2,30}?)\s*(?:的|正式|已经|开业|启幕|迎客|$)/);
  if (inPattern && inPattern[1].length > 2) return inPattern[1].trim();

  return null;
}

/**
 * Parse a single 最新快讯 item. Returns a date extracted from the description,
 * or null if no date found.
 */
function parseFlashNewsDate(descText) {
  if (!descText) return null;

  // Try "X月X日" first (most common in flash news)
  const mdMatch = descText.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (mdMatch) {
    const now = new Date();
    const year = now.getFullYear();
    return parseDate(`${mdMatch[1]}月${mdMatch[2]}日`, year);
  }

  // Full date "2026年6月26日"
  const fullMatch = descText.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (fullMatch) {
    return parseDate(`${fullMatch[1]}年${fullMatch[2]}月${fullMatch[3]}日`);
  }

  return null;
}

/**
 * Extract events from the "最新快讯" (flash news) section.
 * This section has `win-kx3` > `win-menu-side` > `win-nav-label p` (title) + `win-meun-content p` (description).
 */
function extractFlashNewsEvents(html, source) {
  const events = [];

  // Find the 最新快讯 section
  const kx3Match = html.match(/<div class="win-kx3">([\s\S]*?)(?:<!-- 快讯 结束|<\/div>\s*<\/div>\s*<div class="wrap_center")/i);
  const sectionHtml = kx3Match ? kx3Match[1] : "";

  // Match each win-menu-side block
  const sideRegex = /<ul class="win-menu-side">([\s\S]*?)<\/ul>/gi;
  let sideMatch;

  while ((sideMatch = sideRegex.exec(sectionHtml)) !== null) {
    const block = sideMatch[1];

    // Extract title from win-nav-label > p
    const titleMatch = block.match(/<div class="win-nav-label"[^>]*>[\s\S]*?<p>([^<]+)<\/p>/i);
    const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : "";
    if (!title || title.length < 4) continue;

    // Check if it's a store opening title
    if (!STORE_OPENING_KEYWORDS.test(title)) continue;
    if (EXCLUDE_KEYWORDS.test(title)) continue;

    // Extract description from win-meun-content > p
    const descMatch = block.match(/<div class="win-meun-content">[\s\S]*?<p>([\s\S]*?)<\/p>/i);
    const descText = descMatch ? stripTags(descMatch[1]).trim() : "";

    // Extract date from description
    const startTime = parseFlashNewsDate(descText);
    if (!startTime) continue;

    // Extract venue from description
    const venue = extractVenue(descText) || "上海";

    const event = buildEvent({
      title,
      start_time: startTime,
      end_time: null,
      venue,
      signup_url: source.url,
      source,
    });

    if (event) events.push(event);
  }

  return events;
}

/**
 * Extract events from the article list section (wnewslist).
 * These are links with titles about store openings.
 */
function extractArticleListEvents(html, source) {
  const events = [];

  // Find the wnewslist section
  const listMatch = html.match(/<div class="wnewslist">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="wrap_right"/i);
  const listHtml = listMatch ? listMatch[1] : "";

  // Match each link
  const linkRegex = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let linkMatch;

  while ((linkMatch = linkRegex.exec(listHtml)) !== null) {
    const href = linkMatch[1];
    const title = decodeHtml(linkMatch[2]).trim();

    if (!title || title.length < 6) continue;
    if (!STORE_OPENING_KEYWORDS.test(title)) continue;
    if (EXCLUDE_KEYWORDS.test(title)) continue;

    // For article list items without explicit dates, use a default recent date
    const now = new Date();
    const startTime = toShanghaiIso(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const event = buildEvent({
      title,
      start_time: startTime,
      end_time: null,
      venue: "上海",
      signup_url: href,
      source,
    });

    if (event) events.push(event);
  }

  return events;
}

/**
 * Extract events from the "newsdata" section.
 * These cards have titles, tags, and dates in YYYY-MM-DD format.
 */
function extractNewsDataEvents(html, source) {
  const events = [];

  // Find the newsdata section
  const dataMatch = html.match(/<div class="newsdata">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="mh20"/i);
  const dataHtml = dataMatch ? dataMatch[1] : "";

  // Match each li block
  const liRegex = /<li>([\s\S]*?)<\/li>/gi;
  let liMatch;

  while ((liMatch = liRegex.exec(dataHtml)) !== null) {
    const block = liMatch[1];

    // Extract link and title
    const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*>[\s\S]*?<p>([^<]+)<\/p>/i);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const title = decodeHtml(linkMatch[2]).trim();
    if (!title || title.length < 4) continue;

    if (!STORE_OPENING_KEYWORDS.test(title)) continue;

    // Extract date (last span in the second p)
    const dateMatch = block.match(/(20\d{2}-\d{2}-\d{2})/);
    const startTime = dateMatch ? parseDate(dateMatch[1]) : null;
    if (!startTime) continue;

    // Extract venue/tags from spans
    const venueMatch = block.match(/<span>([^<]+)<\/span>/);
    const venue = venueMatch ? decodeHtml(venueMatch[1]).trim() : "上海";

    const event = buildEvent({
      title,
      start_time: startTime,
      end_time: null,
      venue,
      signup_url: href,
      source,
    });

    if (event) events.push(event);
  }

  return events;
}

/**
 * Parse the 赢商网 (Winshang) homepage for new store opening news.
 *
 * Extracts events from three sections:
 * 1. 最新快讯 (flash news) - rich descriptions with dates
 * 2. 文章列表 (article list) - link titles with store opening keywords
 * 3. 数据新闻 (news data cards) - dated cards
 *
 * @param {string} html - The listing page HTML
 * @param {{name: string, url: string, category: string, locale: string}} source - Source metadata
 * @returns {Array} Array of event objects
 */
export function parseWinshang(html, source) {
  const events = [];

  // 1. Flash news section (best source for dates and venues)
  events.push(...extractFlashNewsEvents(html, source));

  // 2. News data cards (cards with YYYY-MM-DD dates)
  events.push(...extractNewsDataEvents(html, source));

  // 3. Article list (titles only, no dates)
  events.push(...extractArticleListEvents(html, source));

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
