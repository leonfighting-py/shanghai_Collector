import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags } from "./shared.js";

// 华师大「院系学术讲座荟萃」列表页（SSR）：
// <li class="rlist1"><a href="...info/1034/xxxxx.htm"><span class="pubtime">08-10</span>
//   <span class="pubtimey">/2026</span><span class="source">【主页讲座】</span>
//   <span class="lecturetime  lessontitle">8月15日 岳晓航：...</span></a></li>
const LIST_ITEM_RE =
  /<li class="rlist1">\s*<a href="([^"]+)"[^>]*>[\s\S]*?<span class="pubtime">([^<]+)<\/span>\s*<span class="pubtimey">([^<]+)<\/span>\s*<span class="source">([^<]+)<\/span>\s*<span class="lecturetime[^"]*">([\s\S]*?)<\/span>/g;

// 详情页结构：<strong>开始时间：</strong>2026-08-15 10:00:00<br>
//           <strong>举行地点：</strong>普陀校区理科大楼A1114<br>
const DETAIL_TIME_RE = /开始时间[：:]\s*<\/strong>\s*([^<\n]{4,40})/;
const DETAIL_VENUE_RE = /举行地点[：:]\s*<\/strong>\s*([^<\n]{2,60})/;

export async function parseEcnuLectures(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const items = [];
  const seen = new Set();

  for (const m of html.matchAll(LIST_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const pubYear = (m[3] || "").replace(/[^\d]/g, "");
    const rawTitle = stripTags(m[5]).trim();
    // 标题前缀常含讲座日期（如「8月15日 岳晓航：…」），展示时去掉前缀，日期走详情页精确值
    const displayTitle = rawTitle.replace(/^\d{1,2}月\d{1,2}日\s*/, "").trim();
    if (!displayTitle) continue;

    items.push({ href, displayTitle, rawTitle, pubYear });
  }

  return mapWithLimit(items.slice(0, 12), 4, async (item) => {
    let startTime = null;
    let venue = "华东师范大学";

    try {
      const detail = await fetchHtml(item.href);
      const timeRaw = detail.match(DETAIL_TIME_RE);
      if (timeRaw) {
        const t = stripTags(timeRaw[1]).match(/(20\d{2}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/);
        if (t) startTime = `${t[1]}T${t[2].padStart(2, "0")}:${t[3]}:00+08:00`;
      }
      const venueRaw = detail.match(DETAIL_VENUE_RE);
      if (venueRaw) {
        const v = stripTags(venueRaw[1]).trim();
        if (v) venue = `华东师范大学·${v}`;
      }
    } catch {
      // 详情页抓取失败时用列表标题内日期兜底
    }

    if (!startTime) {
      const td = item.rawTitle.match(/(\d{1,2})月(\d{1,2})日/);
      if (td) {
        const y = item.pubYear || String(new Date().getFullYear());
        startTime = `${y}-${td[1].padStart(2, "0")}-${td[2].padStart(2, "0")}T10:00:00+08:00`;
      }
    }

    return buildEvent({
      title: item.displayTitle,
      start_time: startTime,
      venue,
      signup_url: item.href,
      source,
    });
  });
}
