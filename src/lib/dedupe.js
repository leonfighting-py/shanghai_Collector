import { buildDedupeKey, filterPublishableEvents, mergeDuplicateEvents, normalizeText, toShanghaiDate } from "./events.js";

// 去重当前仅由规则实现（曾预留 LLM 二次去重接口，一直未实现且配置会误导，2026-08 移除）
export async function dedupeEvents(events) {
  return { provider: "rules", events: dedupeWithRules(events) };
}

export function dedupeWithRules(events) {
  const publishable = filterPublishableEvents(events);
  const hardMerged = mergeDuplicateEvents(publishable);
  const merged = [];

  for (const event of hardMerged) {
    const match = merged.find((candidate) => isSoftDuplicate(candidate, event));
    if (!match) {
      merged.push(event);
      continue;
    }

    match.sources = mergeSources(match.sources, event.sources);
    if (!match.end_time && event.end_time) match.end_time = event.end_time;
    if (!match.summary && event.summary) match.summary = event.summary;
    if (!match.image_url && event.image_url) match.image_url = event.image_url;
  }

  return merged.sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}

// 同一报名/源链接且标题相近即判为同一事件：LLM 抽取常把同一活动切成多个标题/日期变体。
// 门槛设得较低但要 >0：既能收拢 NYU 这类"同链接、标题改写"的重复，又能避免误并
// "共用场馆总览页链接"的不同展览（后者标题完全不相交，jaccard=0）。实证稳定区间 0.05–0.20。
const SAME_URL_TITLE_FLOOR = 0.12;

// 长期档期（展览 / 驻场演出）的重复是另一种形态：票务站（格瓦拉、票牛）会把**同一档演出
// 按"场次日"逐条列出**，每条的 end_time 都填整档的结束日。实测 CHIIKAWA DAYS 特展
// 一档就在库里留了 7 行（9.13 / 9.14 / 9.15 / 9.17 / 9.19 / 10.1 / 10.3，end 全是 11.1），
// ERA时空之旅2 同型。这类行按 buildDedupeKey（title|date|venue）永远合不到一起，因为日期不同。
//
// 护栏必须同时成立才合并，误并风险远低于放松标题阈值：
//   1. 双方都是长档期（跨度 ≥ 7 天）
//   2. 档期重叠 ≥ 7 天
//   3. **结束日完全相同**（同一档演出各源抓到的收档日必然一致；这是最硬的一条）
//   4. 场馆相近（jaccard ≥ 0.35 或互相包含，且双方都非空）
// 标题再满足以下任一即可 —— jaccard 对中文标题的前后缀差异惩罚太重，
// "杂技秀《ERA时空之旅2》" vs "演出《ERA时空之旅2》" 只有 0.53，不能只靠它：
//   · jaccard ≥ 0.72
//   · 短标题（≥ 6 字）被长标题完整包含
//   · 最长公共子串 ≥ 5 字（"era时空之旅2" 这类共享核心名）
const LONG_RUN_MIN_SPAN_DAYS = 7;
const LONG_RUN_MIN_OVERLAP_DAYS = 7;
const LONG_RUN_TITLE_FLOOR = 0.72;
const CONTAINMENT_MIN_LENGTH = 6;
const SHARED_CORE_MIN_LENGTH = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isSoftDuplicate(left, right) {
  const leftTitle = comparableTitle(left.title);
  const rightTitle = comparableTitle(right.title);
  const titleSimilarity = jaccardSimilarity(leftTitle, rightTitle);
  const leftVenue = normalizeText(left.venue);
  const rightVenue = normalizeText(right.venue);
  const sameUrl = left.signup_url === right.signup_url || left.source_url === right.source_url;

  if (sameUrl && titleSimilarity >= SAME_URL_TITLE_FLOOR) return true;

  if (left.category !== right.category) return false;

  const venueSimilarity = jaccardSimilarity(leftVenue, rightVenue);
  const venueContains = leftVenue.includes(rightVenue) || rightVenue.includes(leftVenue);
  const venuesMatch = Boolean(leftVenue) && Boolean(rightVenue) && (venueSimilarity >= 0.35 || venueContains);

  // 长档期同演出：见上面的护栏说明
  if (
    venuesMatch &&
    sameEndDay(left, right) &&
    spanDays(left) >= LONG_RUN_MIN_SPAN_DAYS &&
    spanDays(right) >= LONG_RUN_MIN_SPAN_DAYS &&
    overlapDays(left, right) >= LONG_RUN_MIN_OVERLAP_DAYS &&
    titlesMatch(leftTitle, rightTitle)
  ) {
    return true;
  }

  if (Math.abs(dateDistanceDays(left.start_time, right.start_time)) > 1) return false;

  return titleSimilarity >= 0.82 && venuesMatch;
}

function titlesMatch(leftTitle, rightTitle) {
  if (!leftTitle || !rightTitle) return false;
  if (leftTitle === rightTitle) return true;
  if (jaccardSimilarity(leftTitle, rightTitle) >= LONG_RUN_TITLE_FLOOR) return true;

  const [shorter, longer] = leftTitle.length <= rightTitle.length ? [leftTitle, rightTitle] : [rightTitle, leftTitle];
  if (shorter.length >= CONTAINMENT_MIN_LENGTH && longer.includes(shorter)) return true;

  return longestCommonSubstringLength(leftTitle, rightTitle) >= SHARED_CORE_MIN_LENGTH;
}

/** 最长公共子串长度（滚动数组 DP，标题很短，开销可忽略） */
function longestCommonSubstringLength(left, right) {
  if (!left || !right) return 0;
  let previous = new Array(right.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= left.length; i += 1) {
    const current = new Array(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

function startMs(event) {
  return new Date(event.start_time).getTime();
}

function endMs(event) {
  return event.end_time ? new Date(event.end_time).getTime() : startMs(event);
}

/** 收档日是否同一天（上海日期）。任一方无 end_time 时返回 false —— 单场活动不参与长档期合并 */
function sameEndDay(left, right) {
  if (!left?.end_time || !right?.end_time) return false;
  return toShanghaiDate(left.end_time) === toShanghaiDate(right.end_time);
}

/** 档期跨度（天）。无 end_time 视为 0 */
function spanDays(event) {
  if (!event?.start_time || !event?.end_time) return 0;
  return (endMs(event) - startMs(event)) / DAY_MS;
}

/** 两个档期的重叠天数，不重叠返回负数 */
function overlapDays(left, right) {
  if (!left?.start_time || !right?.start_time) return 0;
  const start = Math.max(startMs(left), startMs(right));
  const end = Math.min(endMs(left), endMs(right));
  return (end - start) / DAY_MS;
}

function comparableTitle(value) {
  return normalizeText(value).replace(/20\d{2}/g, "");
}

function dateDistanceDays(left, right) {
  const leftMs = new Date(`${toShanghaiDate(left)}T00:00:00+08:00`).getTime();
  const rightMs = new Date(`${toShanghaiDate(right)}T00:00:00+08:00`).getTime();
  return (leftMs - rightMs) / (24 * 60 * 60 * 1000);
}

function jaccardSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = toTokenSet(left);
  const rightTokens = toTokenSet(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function toTokenSet(value) {
  const chars = [...value];
  if (chars.length <= 2) return new Set([value]);
  return new Set(chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`));
}

function mergeSources(left = [], right = []) {
  const seen = new Set();
  const sources = [];
  for (const source of [...left, ...right]) {
    const key = `${source.name}|${source.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  return sources;
}

export function withDedupeKey(event) {
  return {
    ...event,
    dedupe_key: event.dedupe_key || buildDedupeKey(event),
  };
}
