// 信源分级（T1 一手源 / T2 聚合器）—— 从 collector.js 原样搬出（2026-11-11 WP1）。
// T1 优先：去重合并时 T1 的字段覆盖 T2（同一条活动优先采纳场馆信息），
// 推荐评分对含 T1 来源的活动温和加权。
const T1_VENUE_NAMES = new Set([
  "teamLab 无界上海",
  "UCCA Edge 上海",
  "Fotografiska 上海",
  "AI Tinkerers Shanghai",
]);
const T1_NAME_PATTERNS = [/美术馆|博物馆|艺术宫|艺术中心|剧院|文化广场/];
const T2_NAME_PATTERNS = [/豆瓣|SmartShanghai|AllEvents|Eventbrite|iMuseum|赢商网|Timeout|上海热线|活动行|互动吧|Lu\.?ma|格瓦拉|票牛|Meetup/i];

export function resolveSourceTier(source) {
  if (source?.tier) return source.tier;
  const name = source?.name || "";
  const url = source?.url || "";
  if (/\.edu\.cn(\/|$)/i.test(url) || /nyu\.edu/i.test(url)) return "T1";
  if (/\.gov\.cn(\/|$)/i.test(url)) return "T1";
  if (T1_VENUE_NAMES.has(name)) return "T1";
  if (T1_NAME_PATTERNS.some((re) => re.test(name))) return "T1";
  if (T2_NAME_PATTERNS.some((re) => re.test(name))) return "T2";
  return "T2";
}
