import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags, uniqueBy } from "./shared.js";

// 通用中文高校 CMS（门户 list.htm 家族）讲座/活动栏目解析器：
// 上海多所高校的官网栏目使用同一套 CMS 派生模板，条目模板略有差异，统一按
// 「详情链接 + 标题 + 日期」抽取；列表内联了「时间/地点」的直接采用，
// 否则抓详情页（限量）补全，详情页无结构字段时退回列表发布日期。
// 已适配模板（2026-10 实测）：
//   T1 usst 内联：<li class="news"><a href title>… news_date … news_time 时间：… news_address 地点：…
//   T2 news 族：<li class="news…"><div|span class="news_title"><a href='…' title='…'> … news_meta>日期
//   T3 上师大 chy_news：<li class="chy_news…">…<div class="week">日期</div>…<a href='…' title='…'
//   T4 海事 tz-ul：<li …data-aos…><a href="…" title="…">…<div class="one-center-bottom-date"><span>日期
//   T5 上政 column-news-item：<a class="column-news-item" href>…<span class="column-news-title">标题</span>…日期
//   T6 海洋 col_news_item：<div class="col_news_item…">…<span class="col_news_title"><a href='…' title='…'>…日期
//   T7 上戏 cols 族：<li class="cols…"><span class="cols_title"><a href='…' title='…'> … cols_meta>日期

const TEMPLATES = [
  {
    name: "usst-inline",
    re: /<li class="news">\s*<a href="([^"]+)"[^>]*title="([^"]*)"([\s\S]*?)<\/a><\/li>/g,
    groups: { href: 1, title: 2, block: 3 },
    fields: {
      date: /news_date"><span>\s*(20\d{2}-\d{2}-\d{2})/,
      time: /news_time">\s*时间[：:]\s*([^<]*)/,
      venue: /news_address">\s*地点[：:]\s*([^<]*)/,
    },
  },
  {
    name: "news-meta",
    re: /<li class="news[^"]*"[^>]*>\s*<(?:div|span) class="news_title"><a href='([^']+)'[^>]*?title='([^']*)'[\s\S]{0,120}?<(?:div|span) class="news_meta">\s*(20\d{2}-\d{2}-\d{2})/g,
    groups: { href: 1, title: 2, date: 3 },
  },
  {
    name: "shnu-chy",
    re: /<li class="chy_news[^"]*"[\s\S]{0,1500}?<div class="week">\s*(20\d{2}-\d{2}-\d{2})\s*<\/div>[\s\S]{0,1500}?<a href='([^']+)'[^>]*?title='([^']*)'/g,
    groups: { date: 1, href: 2, title: 3 },
  },
  {
    name: "shmtu-tz",
    re: /<li[^>]*data-aos[^>]*>\s*<a href="([^"]+)"[^>]*title="([^"]*)"[\s\S]{0,500}?one-center-bottom-date"><span>\s*(20\d{2}-\d{2}-\d{2})/g,
    groups: { href: 1, title: 2, date: 3 },
  },
  {
    name: "shupl-column",
    re: /<a class="column-news-item[^"]*" href="([^"]+)"[^>]*>\s*<span class="column-news-title">([\s\S]*?)<\/span>[\s\S]{0,80}?<span class="column-news-date[^"]*">\s*(20\d{2}-\d{2}-\d{2})/g,
    groups: { href: 1, title: 2, date: 3 },
  },
  {
    name: "shou-col",
    re: /<div class="col_news_item[^"]*"[^>]*>\s*<span class="col_news_title"><a href='([^']+)'[^>]*?title='([^']*)'[\s\S]{0,120}?<span class="col_news_date">\s*(20\d{2}-\d{2}-\d{2})/g,
    groups: { href: 1, title: 2, date: 3 },
  },
  {
    name: "sta-cols",
    re: /<li class="cols[^"]*"[^>]*>\s*<span class="cols_title"><a href='([^']+)'[^>]*?title='([^']*)'[\s\S]{0,120}?<span class="cols_meta">\s*(20\d{2}-\d{2}-\d{2})/g,
    groups: { href: 1, title: 2, date: 3 },
  },
];

const MAX_ITEMS = 24;
const MAX_DETAIL_FETCH = 10;

// 详情页结构字段：「时 间：2026 年 6 月 17 日（周三） 14:30-16:00 地 点：…」
function extractDetailMeta(detailHtml) {
  const text = stripTags(detailHtml).replace(/\s+/g, " ");
  const timeRaw = text.match(/时\s*间[：:]\s*([\s\S]{3,60}?)\s*(?=地\s*点|主\s*办|主\s*讲|$)/)?.[1] || "";
  const venueRaw = text.match(/地\s*点[：:]\s*([\s\S]{2,60}?)\s*(?=主\s*办|主\s*讲|时\s*间|简\s*介|$)/)?.[1] || "";
  return { detailTime: timeRaw.trim(), detailVenue: venueRaw.trim() };
}

// 「2026 年 6 月 17 日（周三） 14:30-16:00」「2026年6月29日15点」→ ISO 时间
function parseCnDateTime(raw) {
  const text = String(raw || "").replace(/\s+/g, "");
  const date = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (!date) return null;
  const withMinutes = text.match(/(\d{1,2})[:：](\d{2})/);
  const withHour = text.match(/(\d{1,2})[点时]/);
  const hour = withMinutes ? withMinutes[1] : withHour ? withHour[1] : "10";
  const minute = withMinutes ? withMinutes[2] : "00";
  return `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`;
}

export async function parseCnCmsLectures(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const items = [];

  for (const template of TEMPLATES) {
    for (const match of html.matchAll(template.re)) {
      const g = template.groups;
      const fields = template.fields || {};
      let date = g.date ? match[g.date] : null;
      let inlineTime = "";
      let inlineVenue = "";
      if (template.fields) {
        const block = match[g.block] || "";
        date = block.match(fields.date)?.[1];
        inlineTime = block.match(fields.time)?.[1] || "";
        inlineVenue = block.match(fields.venue)?.[1] || "";
      }
      const href = absoluteUrl(source.url, match[g.href]);
      const title = stripTags(match[g.title] || "").trim();
      if (!href || !title || !date) continue;
      const image = g.image ? absoluteUrl(source.url, match[g.image]) : null;
      items.push({ href, title, date: date.trim(), inlineTime: inlineTime.trim(), inlineVenue: inlineVenue.trim(), image });
    }
  }

  const deduped = uniqueBy(items, (item) => item.href).slice(0, MAX_ITEMS);

  // 仅对列表未内联「时间/地点」的条目抓详情，限量以控制请求数
  const needsDetail = deduped.filter((item) => !parseCnDateTime(item.inlineTime)).slice(0, MAX_DETAIL_FETCH);
  const enriched = await mapWithLimit(needsDetail, 3, async (item) => {
    try {
      return { ...item, ...extractDetailMeta(await fetchHtml(item.href)) };
    } catch {
      return item;
    }
  });
  const enrichedByHref = new Map(enriched.map((item) => [item.href, item]));

  const events = [];
  for (const item of deduped) {
    const merged = enrichedByHref.get(item.href) || item;
    const startTime =
      parseCnDateTime(merged.inlineTime) || parseCnDateTime(merged.detailTime) || merged.date;
    const venueRaw = (merged.inlineVenue || merged.detailVenue || "").replace(/^[：:\s]+/, "").trim();
    let venue = source.defaultVenue || "上海";
    if (venueRaw) {
      venue = source.venueLabel && !venueRaw.includes(source.venueLabel) ? `${source.venueLabel}·${venueRaw}` : venueRaw;
    }
    const event = buildEvent({
      title: merged.title,
      start_time: startTime,
      venue,
      signup_url: merged.href,
      image_url: merged.image,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}