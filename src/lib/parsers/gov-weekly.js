import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags, uniqueBy } from "./shared.js";

/**
 * 政府门户「区文化活动预告」周报展开式解析器。
 *
 * 为什么需要单独一个 parser：这类页面是**多场活动的目录**（一篇正文里 10~40 场），
 * cnCmsLectures 只会把它当一条「周报」收进来，而 events.js 的 NEWS_TITLE_PATTERNS
 * 又会把「第N周…活动…预告」正确剔除 —— 结果是这类源常年 0 条。正确做法是把一篇拆成多场。
 *
 * 已适配两种正文排版（2026-10-18 实测）：
 *   T1 字段式（普陀区政府）：
 *      活动名称：美育大课堂声控机器人科普手作体验
 *      时间：10月16日15:30
 *      地点：普陀区图书馆3楼学术报告厅1（铜川路1278号）
 *      活动内容：…　参与方式：…
 *   T2 段首标题式（虹口区文化馆）：
 *      江湾镇街道分馆            ← 分组标题（无日期，忽略）
 *      传统沪剧《槐花泪》观演活动  ← 标题
 *      活动时间：2026年10月28日下午13:30
 *      活动地点：虹口区文化馆江湾镇街道分馆小剧场（丰镇路21号）
 *      参与方式：…　活动简介：…
 *
 * 双模式：给列表页就自己找文章链接再逐篇展开；给文章页就直接展开。
 */

const ARTICLE_HINT = /(预告|活动安排|活动一览|活动日历|活动清单|展讯|展览|演出季|演出|文化配送|文化馆|文旅)/;
// 「便民提示」类栏目混着就业、菜价、政务通知，标题命中这些的直接跳过
const ARTICLE_EXCLUDE = /(就业|招聘|求职|政策|价格|监测表|招标|公示|体检|公交|地铁|施工|交通管制|疫苗|门诊|挂号|停水|停电|燃气|天气)/;
// 强特征：这类标题基本就是「多场活动清单」，优先展开；弱特征多为单场直播/讲座
const ARTICLE_STRONG = /(文化活动|文化馆|文化配送|活动一览|活动日历|活动清单|展讯|演出季|艺术节)/;
const MAX_ARTICLES = 10;
const MAX_DETAIL_CONCURRENCY = 3;
// 列表页里「像预告」的文章必须一次拆出 ≥2 场，否则多半是新闻稿里恰好有「时间/地点」字段
const MIN_BLOCKS_PER_ARTICLE = 2;
const DEFAULT_PAGES = 1;

const FIELD_TITLE = /^(?:活动名称|活动主题|主题)\s*[：:]\s*(.+)$/;
const FIELD_TIME = /^(?:活动时间|举办时间|时间)\s*[：:]\s*(.+)$/;
const FIELD_VENUE = /^(?:活动地点|举办地点|活动地址|地点|地址)\s*[：:]\s*(.+)$/;
// 命中即「这一段的活动字段结束」，用来截断标题/地点
const FIELD_STOP = /^(?:参与方式|报名方式|活动内容|活动简介|内容简介|活动介绍|简介|主办单位|承办单位|咨询电话|联系方式)/;

const NAMED_ENTITIES = {
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  bull: "·",
  middot: "·",
  times: "×",
  quot: '"',
  amp: "&",
  nbsp: " ",
};

export function decodeEntities(text = "") {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (raw, name) => NAMED_ENTITIES[name.toLowerCase()] ?? raw);
}

/** HTML → 按可见行切分的纯文本（保留换行，否则字段会连成一片） */
function toLines(html = "") {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u3000\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePunct(text = "") {
  return String(text)
    .replace(/[：]/g, ":")
    .replace(/[－—–~～至]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 「2026年10月15日，10:00-11:30」「10月16日15:30」「2026年10月(每周六)下午15:30」
 * → { start_time, end_time }；缺年时用发布年兜底，跨年（月份早于发布月 6 个月以上）顺延一年。
 */
export function parsePreviewWhen(raw, publishDate) {
  const text = normalizePunct(raw);
  const ref = publishDate instanceof Date && !Number.isNaN(publishDate.getTime()) ? publishDate : new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;

  const full = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const short = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  let year;
  let month;
  let day;
  if (full) {
    year = Number(full[1]);
    month = Number(full[2]);
    day = Number(full[3]);
  } else if (short) {
    month = Number(short[1]);
    day = Number(short[2]);
    year = refMonth - month >= 7 ? refYear + 1 : refYear;
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // 只认日期之后的时段，避免把「3楼」这类数字当年份
  const afterDate = text.slice((full || short).index + (full || short)[0].length);
  const period = afterDate.match(/(上午|下午|晚上|中午|清晨|傍晚)?\s*(\d{1,2})\s*[:点]\s*(\d{2})?/);
  let hour = 10;
  let minute = 0;
  if (period) {
    hour = Number(period[2]);
    minute = period[3] ? Number(period[3]) : 0;
    const label = period[1] || "";
    if ((label === "下午" || label === "晚上" || label === "傍晚") && hour < 12) hour += 12;
    if (label === "中午" && hour < 11) hour += 12;
  }
  if (hour > 23 || minute > 59) {
    hour = 10;
    minute = 0;
  }

  const pad = (value) => String(value).padStart(2, "0");
  const start = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
  return start;
}

/** 从一行/多行文本里抽「标题 + 时间 + 地点」块（T1 与 T2 通吃） */
export function extractWeeklyBlocks(html, { publishDate } = {}) {
  const lines = toLines(html);
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const timeLine = lines[index].match(FIELD_TIME);
    if (!timeLine) continue;

    // 标题：优先本段（或前 1~3 行）的「活动名称/主题」字段，否则取紧邻的上一行标题行
    let title = "";
    for (let back = 0; back <= 3 && index - back >= 0; back += 1) {
      const candidate = lines[index - back];
      const labelled = candidate.match(FIELD_TITLE);
      if (labelled) {
        title = labelled[1];
        break;
      }
      if (FIELD_TIME.test(candidate) || FIELD_VENUE.test(candidate) || FIELD_STOP.test(candidate)) continue;
      if (back > 0 && !title && candidate.length >= 4 && candidate.length <= 80) {
        title = candidate;
      }
    }
    title = decodeEntities(stripTags(title)).replace(/[，,。;；]$/, "").trim();
    if (!title || title.length < 4) continue;

    // 地点：本行之后 1~3 行内的「活动地点/地点」字段
    let venue = "";
    for (let next = index + 1; next <= Math.min(index + 3, lines.length - 1); next += 1) {
      const matched = lines[next].match(FIELD_VENUE);
      if (matched) {
        venue = matched[1].trim();
        break;
      }
    }
    venue = decodeEntities(stripTags(venue)).trim();

    const startTime = parsePreviewWhen(timeLine[1], publishDate);
    if (!startTime) continue;

    blocks.push({ title, start_time: startTime, venue });
  }

  return uniqueBy(blocks, (block) => `${block.title}|${block.start_time}`);
}

function pickArticleLinks(html, source) {
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = absoluteUrl(source.url, match[1]);
    if (!href) continue;
    const label = decodeEntities(stripTags(match[2]));
    if (!label || label.length < 6) continue;
    // 只认标题里明说是「预告/活动安排」的文章：按 URL 形状收会混进新闻稿
    if (!ARTICLE_HINT.test(label) || ARTICLE_EXCLUDE.test(label)) continue;
    candidates.push({ href, label, strong: ARTICLE_STRONG.test(label) ? 1 : 0 });
  }
  // 强特征优先：一页里常常「单场直播预告」排在前、「一周活动一览」排在后，
  // 只按顺序截断会把真正能拆出多场的文章挤掉（2026-10-18 实测踩过）。
  return uniqueBy(candidates, (item) => item.href).sort((left, right) => right.strong - left.strong);
}

function publishDateFromUrl(url) {
  const matched = String(url).match(/\/(20\d{2})(\d{2})(\d{2})\//);
  if (!matched) return null;
  const date = new Date(`${matched[1]}-${matched[2]}-${matched[3]}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** index.html → index_2.html …；目录 URL → index_2.html */
export function siblingListPageUrl(url, page) {
  try {
    const parsed = new URL(url);
    if (/index\.html?$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/index\.html?$/i, `index_${page}.html`);
      return parsed.href;
    }
    if (parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}index_${page}.html`;
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

export async function parseGovWeeklyEvents(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const direct = extractWeeklyBlocks(html, { publishDate: publishDateFromUrl(source.url) });
  if (direct.length > 0) {
    return buildEvents(direct, source, source.url);
  }

  // 列表页：翻 source.weeklyPages 页，找「文化预告」文章再逐篇展开
  const pages = [html];
  const pageCount = Math.min(Math.max(1, Number(source.weeklyPages) || DEFAULT_PAGES), 10);
  for (let page = 2; page <= pageCount; page += 1) {
    const pageUrl = siblingListPageUrl(source.url, page);
    if (!pageUrl) break;
    try {
      pages.push(await fetchHtml(pageUrl));
    } catch {
      break;
    }
  }

  const picked = uniqueBy(
    pages.flatMap((pageHtml) => pickArticleLinks(pageHtml, source)),
    (item) => item.href,
  );
  // 有强特征文章时不再为弱特征（多为单场直播/单篇讲座）多打一次详情请求
  const strong = picked.filter((item) => item.strong);
  const links = (strong.length > 0 ? strong : picked).slice(0, MAX_ARTICLES);
  if (links.length === 0) return [];

  const expanded = await mapWithLimit(links, MAX_DETAIL_CONCURRENCY, async (link) => {
    try {
      const detailHtml = await fetchHtml(link.href);
      const blocks = extractWeeklyBlocks(detailHtml, { publishDate: publishDateFromUrl(link.href) });
      if (blocks.length < MIN_BLOCKS_PER_ARTICLE) return [];
      return blocks.map((block) => ({ ...block, signup_url: link.href }));
    } catch {
      return [];
    }
  });

  return buildEvents(expanded, source, source.url);
}

function buildEvents(blocks, source, fallbackUrl) {
  const events = [];
  for (const block of blocks) {
    const event = buildEvent({
      title: block.title,
      start_time: block.start_time,
      venue: block.venue || source.defaultVenue || "上海",
      signup_url: block.signup_url || fallbackUrl,
      source,
    });
    if (event) events.push(event);
  }
  return events;
}
