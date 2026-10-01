import { absoluteUrl, buildEvent, stripTags } from "./shared.js";

// 上海创智学院「创智日历」：https://www.sii.edu.cn/czrl/list.htm
// SSR 列表含往期与新预告（采集时间窗负责过滤），条目结构：
//   <li class="news"><a href="/2026/0918/c12a1230/page.htm" class="news_box">
//     <div class='news_top'><div class='news_meta' time="2026-09-20">…</div>
//       <div class='news_type'>特邀学术报告</div></div>
//     <div class='news_wz'><div class='news_title'>机器能拥有意识吗？…</div>
//       <div class='news_info'>
//         <p class="zjr">主讲人：<span>汪军</span></p>
//         <p>讲座时间：9月20日（周日）10:30-12:00</p>
//         <p>讲座地点：上海创智学院107学术报告厅</p>
//       </div></div></a></li>
// 日期以 news_meta 的 time 属性（YYYY-MM-DD）为准，开始时刻从「讲座时间」文本取。

const ITEM_RE =
  /<a href="([^"]+)" class="news_box">\s*<div class='news_top'>\s*<div class='news_meta' time="([^"]+)">[\s\S]*?<div class='news_type'>([\s\S]*?)<\/div>\s*<\/div>\s*<div class='news_wz'>\s*<div class='news_title'>([\s\S]*?)<\/div>\s*<div class='news_info'>([\s\S]*?)<\/div>/g;

export function parseSiiCalendar(html, source) {
  const events = [];
  const seen = new Set();

  for (const match of html.matchAll(ITEM_RE)) {
    const href = absoluteUrl(source.url, match[1]);
    const date = match[2]?.trim();
    const title = stripTags(match[4]).trim();
    const info = stripTags(match[5]);
    if (!href || !date || !title || seen.has(href)) continue;
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) continue;
    seen.add(href);

    const timeMatch = info.match(/(\d{1,2}):(\d{2})/);
    const startTime = timeMatch
      ? `${date}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00+08:00`
      : date;
    const venueRaw = info.match(/讲座地点[：:]\s*([^<]*)/)?.[1]?.trim();
    const venue = venueRaw
      ? venueRaw.includes("创智学院")
        ? venueRaw
        : `上海创智学院·${venueRaw}`
      : "上海创智学院";

    const event = buildEvent({
      title,
      start_time: startTime,
      venue,
      signup_url: href,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}