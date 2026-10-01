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

// 上述 TEMPLATES 只覆盖已探明的模板；大量高校院系站用同一 CMS 的不同皮肤，
// 逐个硬编正则不可持续。这里补一个通用「<li> 条目块」扫描器兜底：
// 只要某个 <li> 内同时出现「链接 + 标题 + 日期」就认为是一条列表项。
const GENERIC_LI_RE = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
// 排除导航/页脚/友情链接等噪声块
const LI_NOISE_RE =
  /(navbar|footbar|quicklink|friendlink|copyright|版权所有|友情链接|返回顶部|分享到|扫码|官方微博|微信公众号)/i;

function extractGenericLi(html) {
  const items = [];
  for (const match of html.matchAll(GENERIC_LI_RE)) {
    const block = match[1] || "";
    if (LI_NOISE_RE.test(block)) continue;

    const iso = block.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/);
    const splitDate = block.match(/<span>\s*(\d{1,2})\s*<\/span>[\s\S]{0,60}?<p[^>]*>\s*(20\d{2})-(\d{1,2})\s*<\/p>/);
    let normalizedDate = "";
    if (iso) {
      normalizedDate = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    } else if (splitDate) {
      // 分组：1=日 2=年 3=月
      normalizedDate = `${splitDate[2]}-${splitDate[3].padStart(2, "0")}-${splitDate[1].padStart(2, "0")}`;
    } else {
      continue;
    }

    const anchor = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    if (!anchor) continue;
    const href = anchor[1];

    const title = (
      anchor[0].match(/title=["']([^"']*)["']/i)?.[1] ||
      stripTags(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "") ||
      stripTags(block.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "")
    ).trim();
    // 标题过短、纯日期串或纯噪声，说明该块不是列表项载体
    if (title.length < 6 || /^20\d{2}[-/年]\d{1,2}/.test(title)) continue;

    const inlineTime =
      block.match(/时\s*间[：:]\s*([^<\s][^<]{2,40})/)?.[1] ||
      block.match(/((?:20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)[^<]{0,18})/)?.[1] ||
      "";
    const inlineVenue = block.match(/地\s*点[：:]\s*([^<\s][^<]{1,40})/)?.[1] || "";

    items.push({
      href,
      title,
      date: normalizedDate,
      inlineTime: inlineTime.trim(),
      inlineVenue: inlineVenue.trim(),
      image: null,
    });
  }
  return items;
}

// 第三层兜底：<tr> / <div> 布局的站点（如复旦哲学学院、华理化学学院、上财经济学院）
// 既没有 <li> 也没有已知 class，改从「锚点 + 邻近日期」入手：
// 取每个带标题的链接，在其前后一段窗口里找日期，且中间不能夹另一个链接（防止张冠李戴）。
const ANCHOR_RE = /<a\b[^>]*?>[\s\S]*?<\/a>/gi;
const WINDOW_DATE_RE = /(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/g;
const SKIP_HREF_RE = /^(#|javascript:|mailto:)|(\.(css|js|png|jpe?g|gif|svg|ico|pdf|doc|xls)$)/i;

function stripSameHrefAnchors(text, href) {
  // 同一条目里常有两个指向同一详情页的链接（缩略图 + 标题），
  // 它们不构成「下一个条目」，擦除后再判断窗口里是否夹了别的链接。
  return text.replace(/<a\b[^>]*href=["']([^"']+)["'][\s\S]*?<\/a>/gi, (raw, linkHref) =>
    linkHref === href ? " " : raw,
  );
}

function dateFromWindow(before, after) {
  const afterDates = [...after.matchAll(WINDOW_DATE_RE)];
  if (afterDates.length) {
    const first = afterDates[0];
    if (!/<a\b/i.test(after.slice(0, first.index))) return first;
  }
  const beforeDates = [...before.matchAll(WINDOW_DATE_RE)];
  if (beforeDates.length) {
    const last = beforeDates[beforeDates.length - 1];
    if (!/<a\b/i.test(before.slice(last.index + last[0].length))) return last;
  }
  return null;
}

function extractGenericAnchor(html, { enabled = true } = {}) {
  if (!enabled) return [];
  const flat = html.replace(/\s+/g, " ");
  const items = [];
  for (const match of flat.matchAll(ANCHOR_RE)) {
    const raw = match[0];
    const href = raw.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || SKIP_HREF_RE.test(href.trim())) continue;
    const inner = stripTags(raw.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>\s*$/i, ""));
    const title = (raw.match(/title=["']([^"']*)["']/i)?.[1] || inner).trim();
    if (title.length < 6 || title.length > 120) continue;
    if (/^20\d{2}[-/年]\d{1,2}/.test(title)) continue;

    const start = match.index;
    const end = start + raw.length;
    const before = stripSameHrefAnchors(flat.slice(Math.max(0, start - 400), start), href);
    const after = stripSameHrefAnchors(flat.slice(end, end + 500), href);
    const date = dateFromWindow(before, after);
    if (!date) continue;

    items.push({
      href,
      title,
      date: `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`,
      inlineTime: "",
      inlineVenue: "",
      image: null,
    });
  }
  return items;
}

export async function parseCnCmsLectures(html, source, { fetchHtml = defaultFetchHtml, anchorScan = true } = {}) {
  // 三层依次降级：已探明模板 → <li> 通用块 → 锚点+邻近日期；命中结果按优先级保留
  const templateItems = [];

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
      templateItems.push({ href, title, date: date.trim(), inlineTime: inlineTime.trim(), inlineVenue: inlineVenue.trim(), image });
    }
  }

  const genericItems = extractGenericLi(html).map((item) => ({
    ...item,
    href: absoluteUrl(source.url, item.href),
  }));
  const anchorItems = extractGenericAnchor(html, { enabled: anchorScan }).map((item) => ({
    ...item,
    href: absoluteUrl(source.url, item.href),
  }));
  const items = [...templateItems, ...genericItems, ...anchorItems];

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