import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, mapWithLimit, uniqueBy } from "./shared.js";
import { parseJsonLdEvents } from "./json-ld.js";

// 互动吧（活动网 huodong.com）上海频道。
//
// ⚠️ 2026-10 站点改版，旧实现已全部失效，改造点有三：
//   1. **URL 参数失效**：旧地址 `www.huodong.com/event?cityCode=310000` 的城市参数被忽略，
//      返回的是「全部城市」列表（首条是北京活动）。现在只有**路径式**城市维度可用：
//      `https://huodong.com/event/shanghai`（城市入口见页面 `/event/{beijing|shanghai|...}`）。
//   2. **列表页没有可用的活动数据**：列表改为 `<article class="activity-card">` 卡片，
//      只带标题 / 相对日期文案（"展至 10月29日"、"今天最后一天"）/ 城市 / 来源票务站；
//      卡片上的 `href`（`/event/detail/<id>`）是**短 id**，可用但需要另抓。
//   3. **详情页带 schema.org JSON-LD**：`<script type="application/ld+json">` 里的
//      `@type: Event` 含准确的 `startDate` / `endDate` / `location.name` / `image`，
//      是唯一可靠的日期来源（列表页的「展至 X」只有结束日，不能当开始日）。
//
// 因此流程为：列表页取卡片详情链接 → 并发限量抓详情页 → 复用通用 JSON-LD 解析器。
// 请求量与改版前一致（10 个详情页 / 并发 2），不增加对源站的压力。
const MAX_DETAIL_FETCH = 10;
const DETAIL_CONCURRENCY = 2;

function extractDetailLinks(html, source) {
  return uniqueBy(
    [...html.matchAll(/<a class="card-hit"[^>]*?href="([^"]+)"/g)]
      .map((match) => absoluteUrl(source.url, match[1]))
      .filter((href) => href && /\/event\/detail\//.test(href)),
    (href) => href,
  ).slice(0, MAX_DETAIL_FETCH);
}

export async function parseHuodongBa(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const links = extractDetailLinks(html, source);
  if (links.length === 0) return [];

  const perDetail = await mapWithLimit(links, DETAIL_CONCURRENCY, async (href) => {
    try {
      const detail = await fetchHtml(href);
      // 详情页 JSON-LD 里没有 url 字段，用 source.url 兜底会把所有条目的报名链接
      // 都写成列表页地址；这里传一份 url=详情页 的 source 副本，兜底才是对的。
      return parseJsonLdEvents(detail, { ...source, url: href });
    } catch {
      // 单条详情页失败不影响其余条目
      return [];
    }
  });

  return uniqueBy(perDetail, (event) => `${event.title}|${event.start_time}`);
}
