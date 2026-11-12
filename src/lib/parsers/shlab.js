import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags } from "./shared.js";

// 上海人工智能实验室「科研活动」：https://www.shlab.org.cn/event
// SSR 列表条目：
//   <a href="/event/detail/106"><div class="item"><div class="imgbox">
//     <img class="u-img" v-ratio-resize="…" src="https://img.shlab.org.cn/pjlab/slides/2026/09/xxx.jpg">
//     <img title="点击收藏" class="collect u-img1 event-106" src="data:image/svg+xml;base64,…"> </div>
//     <div class="txtbox"><h2>上海AI实验室联合上海交大…（10月7日）</h2> </div></div></a>
// 列表标题并非都含日期（活动预告类含「（10月7日）」，招募/往期回顾类没有），因此：
//   - 标题含「M月D日」→ 直接采用；年份按封面图路径的发布年月推断（12 月发布的活动预告按次年 1 月处理）；
//   - 标题无日期 → 抓详情页（限量 4 条），只接受正文含明确年份的日期（如「2026年3月1日」），
//     且正文提到海外城市（实验室在海外办会/参会）时跳过，避免把境外活动标成上海。
// 详情页 128KB 且条目仅个位数，限量抓取成本可控。

const ITEM_RE = /<a href="(\/event\/detail\/\d+)">([\s\S]{0,4500}?)<\/a>/g;
const OVERSEAS_RE = /瑞典|马尔默|新加坡|美国|英国|法国|德国|日本|韩国|海外|当地时间/;
const MAX_DETAIL_FETCH = 4;

function inferTimeFromTitle(title, publishYear, publishMonth) {
  const m = title.match(/(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = publishYear;
  // 12 月发布的「1月X日」预告属于次年
  if (month === 1 && publishMonth === 12) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDetailDate(detailHtml) {
  const text = stripTags(detailHtml);
  const anchor = text.indexOf("活动详情");
  // 只取正文开头一句（活动预告多为「2026年X月X日，…将在上海…举办」的句式）：
  // 取 200 字窗口可避开正文后段的「报名截止时间：2026年9月13日」等非活动日期
  const scope = anchor >= 0 ? text.slice(anchor + 4, anchor + 204) : text.slice(0, 200);
  if (OVERSEAS_RE.test(scope)) return null;
  const m = scope.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  if (/截止|截至/.test(scope.slice(0, m.index))) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export async function parseShlabEvents(html, source, { fetchHtml = defaultFetchHtml, now = new Date() } = {}) {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(ITEM_RE)) {
    const href = absoluteUrl(source.url, match[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const body = match[2];
    const img = body.match(/<img class="u-img"[^>]*src="(https?:[^"]+)"/)?.[1] || null;
    const title = stripTags(body.match(/<div class="txtbox">\s*<h2>([\s\S]*?)<\/h2>/)?.[1] || "").trim();
    if (!title) continue;
    // 封面图路径 …/slides/2026/09/… 内含文章发布年月，用于推断无年份的标题日期
    const publish = img?.match(/\/slides\/(20\d{2})\/(\d{1,2})\//);
    const publishYear = publish ? Number(publish[1]) : now.getFullYear();
    const publishMonth = publish ? Number(publish[2]) : now.getMonth() + 1;
    items.push({ href, title, img, publishYear, publishMonth });
  }

  const events = [];
  const pending = [];

  for (const item of items) {
    const titleTime = inferTimeFromTitle(item.title, item.publishYear, item.publishMonth);
    if (titleTime) {
      const event = buildEvent({
        title: item.title,
        start_time: titleTime,
        venue: "上海",
        signup_url: item.href,
        image_url: item.img,
        source,
      });
      if (event) events.push(event);
    } else {
      pending.push(item);
    }
  }

  const detailEvents = await mapWithLimit(pending.slice(0, MAX_DETAIL_FETCH), 2, async (item) => {
    try {
      const detail = await fetchHtml(item.href);
      const detailTime = extractDetailDate(detail);
      if (!detailTime) return null;
      return buildEvent({
        title: item.title,
        start_time: detailTime,
        venue: "上海",
        signup_url: item.href,
        image_url: item.img,
        source,
      });
    } catch {
      // 详情页抓取失败按单条跳过，不影响列表其余条目
      return null;
    }
  });

  return [...events, ...detailEvents];
}