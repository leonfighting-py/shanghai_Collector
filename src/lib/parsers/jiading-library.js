import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags } from "./shared.js";

// 嘉定区图书馆「嘉图讲座」：http://wenlv.jiading.cn/jdlib/hd/jtjz
// 列表条目：
//   <li class="first"><em class="number">1、</em><span class="date">2026-09-28</span>
//     <a href="/jdlib/hd/jtjz/content_978652" title="标题：… 点击数：0 发表时间：…">标题文本</a></li>
// 列表日期为发布日期；活动时间/地点在详情页的结构化信息里（如「嘉定区图书馆一楼多功能厅（裕民南路1288号）2025年9月7日 14:00」），
// 因此对前若干条抓详情补全，补不到则退回发布日期。

const ITEM_RE =
  /<span class="date">\s*(20\d{2}-\d{2}-\d{2})\s*<\/span>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const MAX_DETAIL_FETCH = 8;

function extractDetailMeta(detailHtml) {
  const text = stripTags(detailHtml).replace(/\s+/g, " ");
  // 活动时间：日期后紧跟时刻
  const timeMatch = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日[^0-9（）()]{0,12}(\d{1,2}):(\d{2})/);
  const venue = text.match(/(嘉定区图书馆[^（(，。；\s]{0,24})/)?.[1]?.trim() || "";
  if (!timeMatch) return { detailTime: "", detailVenue: venue };
  const time = `${timeMatch[1]}-${timeMatch[2].padStart(2, "0")}-${timeMatch[3].padStart(2, "0")}T${timeMatch[4].padStart(2, "0")}:${timeMatch[5]}:00+08:00`;
  return { detailTime: time, detailVenue: venue };
}

export async function parseJiadingLibraryLectures(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(ITEM_RE)) {
    const href = absoluteUrl(source.url, match[2]);
    const title = stripTags(match[3]).trim();
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    items.push({ href, title, date: match[1] });
  }

  const limited = items.slice(0, MAX_DETAIL_FETCH);
  const enriched = await mapWithLimit(limited, 2, async (item) => {
    try {
      return { ...item, ...extractDetailMeta(await fetchHtml(item.href)) };
    } catch {
      return item;
    }
  });

  return enriched
    .map((item) =>
      buildEvent({
        title: item.title,
        start_time: item.detailTime || item.date,
        venue: item.detailVenue || "嘉定区图书馆",
        signup_url: item.href,
        source,
      }),
    )
    .filter(Boolean);
}