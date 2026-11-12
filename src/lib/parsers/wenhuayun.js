import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags, uniqueBy } from "./shared.js";

/**
 * 上海文化云（wenhuayun.cn）活动列表解析器。
 *
 * 站点是「HTML 壳 + AJAX 片段」结构：
 *   · `/ticketActivity/ticketActivityList.do` 只有壳（8 KB，无数据）
 *   · 真正的数据在 `/ticketActivity/ticketActivityListLoad.do?page=N`
 *     —— 返回一段 `<li data-li-url=…>` 卡片列表，页脚 hidden 里带 `countpage` / `total`
 *     （2026-10-18 从 `/STATIC/js/ticket/activity/ticketActivityList.js` 的
 *     `$("#activity_content").load("../ticketActivity/ticketActivityListLoad.do", …)` 反推）
 *
 * 卡片字段（每项）：
 *   <a href="/ticketActivity/ticketActivityDetail.do?activityId=…">标题</a>
 *   <p>地址：…</p>　<p>时间：2026-10-19</p>
 *
 * ⚠️ 时间只有日期、没有时刻 → 交给 buildEvent 之前先补 10:00（与项目其他源一致）；
 *    地址是街道门牌（「镇坪路176弄14号」），没有区名 → 区域标签靠 detectDistrict 的地标表兜。
 */

const ITEM_RE = /<li[^>]*data-li-url[^>]*>([\s\S]*?)<\/li>/gi;
const TITLE_RE = /<h1>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
const VENUE_RE = /<p>\s*地\s*址\s*[：:]\s*([\s\S]*?)<\/p>/i;
const DATE_RE = /<p>\s*时\s*间\s*[：:]\s*([\s\S]*?)<\/p>/i;
const COUNTPAGE_RE = /id="countpage"\s+value="(\d+)"/i;

const MAX_PAGES = 6;
const PAGE_CONCURRENCY = 3;

function compact(text = "") {
  return stripTags(String(text)).replace(/\s+/g, " ").trim();
}

export function parseWenhuayunList(html, source) {
  const events = [];
  for (const match of html.matchAll(ITEM_RE)) {
    const block = match[1] || "";
    const titleMatch = block.match(TITLE_RE);
    if (!titleMatch) continue;
    const title = compact(titleMatch[2]);
    const dateRaw = compact(block.match(DATE_RE)?.[1] || "");
    const day = dateRaw.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (!title || !day) continue;
    const venue = compact(block.match(VENUE_RE)?.[1] || "") || source.defaultVenue || "上海";

    const event = buildEvent({
      title,
      start_time: `${day[1]}-${day[2]}-${day[3]}T10:00:00+08:00`,
      venue,
      signup_url: absoluteUrl(source.url, titleMatch[1]),
      source,
    });
    if (event) events.push(event);
  }
  return uniqueBy(events, (event) => event.signup_url);
}

function pageUrl(baseUrl, page) {
  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set("page", String(page));
    return parsed.href;
  } catch {
    return null;
  }
}

export async function parseWenhuayunEvents(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const first = parseWenhuayunList(html, source);

  const totalPages = Number(html.match(COUNTPAGE_RE)?.[1] || 0);
  const pages = Math.min(totalPages, MAX_PAGES);
  if (pages <= 1) return first;

  const rest = [];
  for (let page = 2; page <= pages; page += 1) rest.push(pageUrl(source.url, page));
  const urls = rest.filter(Boolean);

  const more = await mapWithLimit(urls, PAGE_CONCURRENCY, async (url) => {
    try {
      return parseWenhuayunList(await fetchHtml(url), source);
    } catch {
      return [];
    }
  });

  return uniqueBy([...first, ...more], (event) => event.signup_url);
}
