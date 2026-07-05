import { buildEvent, decodeHtml, stripTags, uniqueBy } from "./shared.js";

/**
 * Keywords indicating event/activity content (not general news).
 * Looks for exhibitions, performances, concerts, festivals, markets, etc.
 */
const EVENT_KEYWORDS = /展览|演出|演唱会|音乐|大展|艺术展|艺术节|音乐节|戏剧|话剧|舞蹈|表演|活动|启幕|开幕|来袭|开启|音乐会|歌剧|芭蕾|戏曲|非遗|市集|集市|夜市|咖啡节|美食节|文化节|电影节|光影|沉浸|快闪|巡演|演奏|首演|公演|剧场|live|show|festival|exhibition|concert|performance/i;

/**
 * Non-event keywords to exclude (policy, education, health, etc.)
 */
const EXCLUDE_KEYWORDS = /通知|公告|政策|招生|考试|教育部|医疗|医院|疾病|药品|手术|症状/;

/**
 * Extract date from URL path like "2026-07/05/"
 */
function parseDateFromUrl(href) {
  if (!href) return null;
  const match = href.match(/(20\d{2})-(\d{2})\/(\d{2})/);
  if (match) {
    return toShanghaiIso(match[1], match[2], match[3]);
  }
  return null;
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
 * Extract a venue hint from article title text.
 */
function extractVenueHint(title) {
  if (!title) return "上海";

  const venuePatterns = [
    /(上海\S{2,10}(?:博物馆|美术馆|艺术馆|音乐厅|剧院|剧场|图书馆|公园|广场|中心|外滩|豫园|南京路|淮海路|静安寺|新天地|陆家嘴|浦东|虹口|徐汇|长宁|黄浦|静安|杨浦|普陀|闵行|宝山|松江|嘉定|青浦|奉贤|金山|崇明))/,
    /(\S{2,8}(?:博物馆|美术馆|艺术馆|音乐厅|剧院|剧场|图书馆|公园|乐园))/,
  ];

  for (const pattern of venuePatterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }

  return "上海";
}

/**
 * Extract all article links from the page that contain event-relevant content.
 * The page has multiple sections (文化, 旅游, 娱乐, 热透) with `<a>` links.
 */
function extractEventLinks(html) {
  const links = [];

  // Match all <a> links with titles
  const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const rawTitle = match[2];

    // Strip any nested HTML tags from title
    const title = stripTags(rawTitle).trim();

    // Skip empty, short titles
    if (!title || title.length < 6 || title.length > 120) continue;

    // Only event-relevant content
    if (!EVENT_KEYWORDS.test(title)) continue;

    // Exclude non-event content
    if (EXCLUDE_KEYWORDS.test(title)) continue;

    // Parse date from URL
    const startTime = parseDateFromUrl(href);
    if (!startTime) continue;

    // Make absolute URL
    let fullUrl = href;
    if (fullUrl.startsWith("//")) fullUrl = "https:" + fullUrl;
    if (!fullUrl.startsWith("http")) {
      fullUrl = "https://www.online.sh.cn" + (fullUrl.startsWith("/") ? "" : "/") + fullUrl;
    }

    links.push({
      title,
      url: fullUrl,
      startTime,
    });
  }

  return links;
}

/**
 * Parse 上海热线 (Shanghai Online) homepage for event/activity content.
 *
 * Shanghai Online is a traditional news portal. Its homepage has sections
 * for 文化 (culture), 旅游 (travel), 娱乐 (entertainment) that contain
 * event-relevant articles about exhibitions, performances, festivals, etc.
 *
 * Dates are extracted from article URL paths (e.g. /content/2026-07/05/...).
 * Venues are inferred from article titles.
 *
 * @param {string} html - The listing page HTML
 * @param {{name: string, url: string, category: string, locale: string}} source - Source metadata
 * @returns {Array} Array of event objects
 */
export function parseShanghaiOnline(html, source) {
  const links = extractEventLinks(html);
  const events = [];

  for (const link of links) {
    const venue = extractVenueHint(link.title);

    const event = buildEvent({
      title: link.title,
      start_time: link.startTime,
      end_time: null,
      venue,
      signup_url: link.url,
      source,
    });

    if (event) events.push(event);
  }

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
