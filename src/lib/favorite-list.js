// 收藏清单的 URL 编码。清单只放 slug，不放标题/时间——slug 是稳定标识（见 event-slug.js），
// 分享出去的链接过两天再打开，标题被富化改过也还认得出是同一场活动。
//
// 两种写法都要吃：本站链接用点号（?list=a.b.c，来自路线图），
// 而 /calendar.ics?slugs= 用逗号（ICS 路由已经上线，动它没好处）。
export const MAX_LIST_SLUGS = 100;

const SLUG_RE = /^[0-9a-z]{10}(-\d+)?$/;

export function isValidSlug(value) {
  return SLUG_RE.test(String(value || ""));
}

/**
 * 解析清单参数。非法的片段直接丢掉（不是整个拒绝）：
 * 分享链接可能被聊天软件截断或加了尾巴，能认几条是几条。
 */
export function parseListParam(value) {
  const seen = new Set();
  const slugs = [];
  for (const piece of String(value || "").split(/[.,\s]+/)) {
    const slug = piece.trim();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length >= MAX_LIST_SLUGS) break;
  }
  return slugs;
}

/** 生成点号分隔的清单参数；顺手去重、截断 */
export function buildListParam(slugs) {
  return parseListParam(Array.isArray(slugs) ? slugs.join(".") : slugs).join(".");
}
