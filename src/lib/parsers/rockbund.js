import { buildEvent } from "./shared.js";

// 上海外滩美术馆（RAM / Rockbund Art Museum）。
//
// ⚠️ 2026-10 站点改版：整站迁到 Next.js **客户端渲染**，`/exhibitions/` 的 SSR HTML
// 里除了页头页脚没有任何展览数据（`__NEXT_DATA__.pageProps.data` 只有
// `{ information: null, menuAndFooter }`），旧实现「从 HTML 里抠 `/exhibitions/` 链接」
// 因此永久返回 0 条。sitemap 虽然列了 436 个 `/calendar/*`，但**没有可用于筛选的 lastmod**
// （全是同一个批量时间戳），要拿当期活动就得把 436 页全爬一遍——不可接受。
//
// 可行路径：站点内容托管在 **Sanity**，公开数据集可直读。
//   · projectId = fvrm4fsf（从 cdn.sanity.io/images/fvrm4fsf/... 反推）
//   · dataset   = production
//   · 查询接口  = https://<projectId>.apicdn.sanity.io/v2021-10-21/data/query/<dataset>?query=<GROQ>
// 一次请求即返回全部**未结束**的展览（含展期），929 字节，比爬详情页温和得多。
// 因此信源 URL 直接指向这条 GROQ 查询（见 collector.js），抓回的 body 就是查询结果 JSON，
// 本 parser 只负责把 JSON 翻译成事件。
//
// 字段说明：`title` 是 localeString（cn/en），`venue` 是引用，
// 故 GROQ 里已用 coalesce 投影成字符串，parser 侧直接取用。
const PROJECT_ID = "fvrm4fsf";
const DATASET = "production";
const SITE_ORIGIN = "https://www.rockbundartmuseum.org";

// 只取「未结束」的展览：长期展览在展期内每天都会被读到，交由下游窗口逻辑筛选。
const GROQ = `*[_type=="exhibition" && (!defined(endDate) || endDate >= now())]|order(startDate asc)[0...30]{"title":coalesce(title.cn,title.en),"slug":slug.current,startDate,endDate,"venue":coalesce(venue->title.cn,venue->title.en,venue->name),"image":mainImage.asset->url}`;

export const ROCKBUND_SANITY_URL = `https://${PROJECT_ID}.apicdn.sanity.io/v2021-10-21/data/query/${DATASET}?query=${encodeURIComponent(GROQ)}`;

export function parseRockbundArtMuseum(body, source) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    // 源站/接口异常时返回空，由健康报告呈现，不中断整批采集
    return [];
  }

  const items = Array.isArray(payload?.result) ? payload.result : [];
  const events = [];
  for (const item of items) {
    const event = buildEvent({
      title: item?.title,
      start_time: item?.startDate,
      end_time: item?.endDate || null,
      venue: item?.venue || "上海外滩美术馆",
      signup_url: item?.slug ? `${SITE_ORIGIN}/exhibitions/${item.slug}` : source.url,
      image_url: item?.image,
      source,
    });
    if (event) events.push(event);
  }
  return events;
}
