import { CATEGORIES, toShanghaiDate } from "./events.js";
import { hasCjkText } from "./locale.js";
import { isUsableImage } from "./image-url.js";

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

// 有封面图的活动显著加权：视觉密度是首页第一印象
const COVER_IMAGE_BOOST = 40;

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
  score += event.image_url ? COVER_IMAGE_BOOST : 0;
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

export function getDisplayTopPicks(
  events,
  limit = 12,
  now = new Date(),
  { preferImages = false } = {},
) {
  const ranked = rankEvents(events, now);
  if (preferImages) {
    const withImages = ranked.filter((event) => isUsableImage(event.image_url));
    const withoutImages = ranked.filter((event) => !isUsableImage(event.image_url));
    return [...withImages, ...withoutImages].slice(0, limit);
  }
  const chinese = ranked.filter((event) => hasCjkText(event.title));
  const other = ranked.filter((event) => !hasCjkText(event.title));
  return [...chinese, ...other].slice(0, limit);
}

function rankEvents(events, now) {
  return [...events]
    .map((event) => ({ ...event, recommendation_score: scoreEvent(event, now) }))
    .sort((left, right) => right.recommendation_score - left.recommendation_score);
}

/**
 * 高校讲座专用排序：按时间维度而非评分排列，方便用户快速锁定近期讲座。
 *
 * 规则：
 *  1. AI 相关讲座优先提到最前（首页讲座栏直接展示），其余按时间排。
 *  2. 当天及未来（未发生）排在前面，按 start_time 升序（由近到远）。
 *  3. 当天之前（已发生）排在后面，按 start_time 降序（由近到远）。
 *
 * 例：今天 9/13 → [AI讲座, 9/13, 9/14, 9/15, ...] | [..., 9/12, 9/11, 9/10]
 */
const AI_LECTURE_KEYWORDS =
  /AI|人工智能|大模型|机器学习|深度学习|LLM|GPT|大语言模型|生成式|神经网络|Tensor|数据挖掘/i;

function isAiRelatedLecture(event) {
  return (
    AI_LECTURE_KEYWORDS.test(event.title || "") ||
    AI_LECTURE_KEYWORDS.test(event.summary || "")
  );
}

export function sortCampusLectures(events, now = new Date()) {
  const today = toShanghaiDate(now);
  const upcoming = [];
  const past = [];
  for (const event of events) {
    if (toShanghaiDate(event.start_time) >= today) {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  }
  upcoming.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  past.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  const timeSorted = [...upcoming, ...past];
  const aiLectures = timeSorted.filter(isAiRelatedLecture);
  const rest = timeSorted.filter((event) => !isAiRelatedLecture(event));
  return [...aiLectures, ...rest];
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
