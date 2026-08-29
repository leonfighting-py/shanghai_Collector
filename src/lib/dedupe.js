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
  }

  return merged.sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}

export function isSoftDuplicate(left, right) {
  if (left.category !== right.category) return false;
  if (Math.abs(dateDistanceDays(left.start_time, right.start_time)) > 1) return false;

  const leftTitle = comparableTitle(left.title);
  const rightTitle = comparableTitle(right.title);
  const titleSimilarity = jaccardSimilarity(leftTitle, rightTitle);
  const leftVenue = normalizeText(left.venue);
  const rightVenue = normalizeText(right.venue);
  const venueSimilarity = jaccardSimilarity(leftVenue, rightVenue);
  const venueContains = leftVenue.includes(rightVenue) || rightVenue.includes(leftVenue);
  const sameUrl = left.signup_url === right.signup_url || left.source_url === right.source_url;

  return sameUrl || (titleSimilarity >= 0.82 && (venueSimilarity >= 0.35 || venueContains));
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
