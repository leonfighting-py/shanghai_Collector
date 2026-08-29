import { CATEGORIES, toShanghaiDate } from "./events.js";
import { hasCjkText } from "./locale.js";

const CHINESE_TITLE_BOOST = 28;

const KEYWORD_WEIGHTS = [
  ["音乐节", 18],
  ["开幕", 16],
  ["限定", 14],
  ["论坛", 12],
  ["公开", 10],
  ["首演", 10],
  ["市集", 8],
  ["咖啡", 8],
  ["爵士", 8],
  ["设计", 6],
];

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 上海时区的小时数（0-23），避免运行时本地时区（如 UTC）导致"今晚/周末"判断错误 */
function shanghaiHour(value) {
  return ((new Date(value).getTime() + SHANGHAI_OFFSET_MS) % 86_400_000) / 3_600_000;
}

/** 上海时区的星期（0=周日），取上海当日正午避免边界日期偏移 */
function shanghaiDay(value) {
  return new Date(`${toShanghaiDate(value)}T12:00:00+08:00`).getUTCDay();
}

export function scoreEvent(event, now = new Date()) {
  let score = 0;
  const sourceCount = event.sources?.length || 1;
  const hour = shanghaiHour(event.start_time);
  const day = shanghaiDay(event.start_time);
  const title = event.title || "";

  score += Math.min(sourceCount, 4) * 8;
  score += categoryBoost(event.category);
  score += event.venue && event.venue !== "上海" ? 12 : 0;
  score += event.signup_url ? 6 : 0;
  score += day === 0 || day === 6 ? 10 : 0;
  score += hour >= 18 ? 8 : 0;
  score += proximityScore(event.start_time, now);

  for (const [keyword, weight] of KEYWORD_WEIGHTS) {
    if (title.includes(keyword)) score += weight;
  }

  if (hasCjkText(title)) score += CHINESE_TITLE_BOOST;

  return score;
}

function categoryBoost(category) {
  if (category === "演出音乐") return 14;
  if (category === "展览") return 10;
  if (category === "线下活动") return 6;
  return 0;
}

export function getTopPicks(events, limit = 12, now = new Date()) {
  return rankEvents(events, now).slice(0, limit);
}

export function getDisplayTopPicks(events, limit = 12, now = new Date()) {
  const ranked = rankEvents(events, now);
  const chinese = ranked.filter((event) => hasCjkText(event.title));
  const other = ranked.filter((event) => !hasCjkText(event.title));
  return [...chinese, ...other].slice(0, limit);
}

function rankEvents(events, now) {
  return [...events]
    .map((event) => ({ ...event, recommendation_score: scoreEvent(event, now) }))
    .sort((left, right) => right.recommendation_score - left.recommendation_score);
}

export function getHeroEvent(events, now = new Date()) {
  return getTopPicks(events, 1, now)[0] || null;
}

export function getCategoryFeatures(events, now = new Date()) {
  const picks = {};
  for (const category of CATEGORIES) {
    picks[category] = getTopPicks(
      events.filter((event) => event.category === category),
      1,
      now,
    )[0] || null;
  }
  return picks;
}

export function getTonightEvents(events, now = new Date()) {
  const today = toShanghaiDate(now);
  return getTopPicks(
    events.filter((event) => {
      const hour = shanghaiHour(event.start_time);
      return toShanghaiDate(event.start_time) === today && hour >= 18;
    }),
    4,
    now,
  );
}

export function getWeekendEvents(events, now = new Date()) {
  return getTopPicks(
    events.filter((event) => {
      const day = shanghaiDay(event.start_time);
      return day === 0 || day === 6;
    }),
    6,
    now,
  );
}

function proximityScore(startTime, now) {
  const diffDays = Math.max(0, (new Date(startTime).getTime() - new Date(now).getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, 14 - diffDays * 2);
}
