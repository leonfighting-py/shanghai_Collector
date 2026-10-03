// 长期活动的结束时间推断（end_time backfill）
//
// 背景：展览、驻场演出这类「长期活动」的源页面经常只给开始日期，不给结束日期。
// 数据库里因此留下 end_time is null 的行 —— 这会同时坏掉两件事：
//   1. 展示：前端只能显示开始日，用户看不出这是一档持续三个月的大展；
//   2. 读窗口 / 保留策略都基于 coalesce(end_time, start_time)，
//      落到 start_time 上就等于「开幕 7 天后就消失/被清掉」。
//
// 所以对「确定是长期活动」的行补一个约 3 个月的结束时间；
// 而对「确定是单场活动」（钢琴独奏、开幕式、导览、讲座……）**必须留空**，
// 交给 coalesce(end_time, start_time) 兜底 —— 给单场演出编 3 个月，
// 会让它在首页挂三个月并挤掉真正的活动，是把错误放大而不是修掉。

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 长期活动默认补足的时长：约 3 个月 */
export const LONG_RUNNING_DAYS = 90;

/** 明确的「长期 / 多日」信号：标题命中即视为一档持续演出的活动 */
const LONG_RUNNING_TITLE_RE =
  /音乐剧|舞台剧|话剧|歌剧|舞剧|杂技剧|木偶剧|亲子剧|儿童剧|沉浸式|驻场|驻演|公演|剧场|演出季|剧季|系列演出|主题展|特展|大展|艺术展|展期|联展|双年展|三年展|艺术节|戏剧节|音乐节|市集|快闪/;

/** 明确的「单场 / 单日」信号：命中则绝不补长期 end_time（优先级高于上面的长期信号） */
const SINGLE_SESSION_TITLE_RE =
  /开幕|导览|讲座|沙龙|对谈|分享会|工作坊|放映|签售|发布会|公开课|大师班|独奏|交响|协奏曲|室内乐|清唱剧|专场音乐会|音乐会/;

/**
 * 是否属于「长期活动」。
 * 注意判定顺序：单场信号优先 —— 「音乐剧《X》音乐会」应当按单场处理。
 */
export function isLongRunningEvent(event) {
  const title = String(event?.title || "");
  if (SINGLE_SESSION_TITLE_RE.test(title)) return false;
  // 展览默认长期：绝大多数展览跨月，且单场性质的展览活动（开幕式/导览）已被上面拦掉
  if (event?.category === "展览") return true;
  return LONG_RUNNING_TITLE_RE.test(title);
}

/** 按上海时区把 ISO 时间整体后移 days 天，保持 "+08:00" 字面量格式（与 parser 的 toShanghaiIso 一致） */
function addDaysShanghai(iso, days) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + days * DAY_MS + SHANGHAI_OFFSET_MS);
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:00+08:00`
  );
}

/**
 * 推断结束时间。返回值语义：
 *   - 源已给出且晚于开始时间 → 原样返回（一手数据永远优先）；
 *   - 单场活动 / 无法判断 → null（保留 coalesce 兜底语义，不编造）；
 *   - 长期活动 → start_time + longRunningDays。
 */
export function inferEventEndTime(event, { longRunningDays = LONG_RUNNING_DAYS } = {}) {
  const start = event?.start_time;
  const current = event?.end_time || null;
  if (!start) return current;

  const startTs = new Date(start).getTime();
  if (Number.isNaN(startTs)) return current;

  const endTs = current ? new Date(current).getTime() : Number.NaN;
  if (!Number.isNaN(endTs) && endTs > startTs) return current;

  if (!isLongRunningEvent(event)) return null;

  return addDaysShanghai(start, longRunningDays);
}
