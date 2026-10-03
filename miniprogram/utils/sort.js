// 排序：与 Web 端 src/lib/recommendations.js 同规则。
//
// 小程序原来只有「按开始时间升序」一种顺序，Web 端的评分体系（多源交叉验证、一手源、
// 封面图、临近期/周末/晚间、标题关键词）没有跟过来 —— 结果同一个活动在两端看到的
// 顺序完全不同。这个文件把评分体系移植过来，并提供「推荐 / 最新」两档。
//
// ⚠️ 改动评分规则时必须同步改 Web 端 src/lib/recommendations.js 的 scoreEvent，
//    否则两端首页顺序会漂。

const format = require("./format.js");

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

const CHINESE_TITLE_BOOST = 28;
// 有封面图加权：视觉密度是首页第一印象，但权重不宜过大，避免没图的好内容沉底
const COVER_IMAGE_BOOST = 20;

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

const AI_LECTURE_KEYWORDS =
  /AI|人工智能|大模型|机器学习|深度学习|LLM|GPT|大语言模型|生成式|神经网络|Tensor|数据挖掘/i;

function hasCjkText(text) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(text || ""));
}

/** 上海时区的小时数（0-23），避免设备时区导致"今晚/周末"判断错误 */
function shanghaiHour(value) {
  return ((new Date(value).getTime() + SHANGHAI_OFFSET) % 86_400_000) / 3_600_000;
}

/** 上海时区的星期（0=周日），取上海当日正午避免边界日期偏移 */
function shanghaiDay(value) {
  return new Date(`${format.toShanghaiDate(value)}T12:00:00+08:00`).getUTCDay();
}

function proximityScore(startTime, now) {
  const diffDays = Math.max(0, (new Date(startTime).getTime() - new Date(now).getTime()) / 86_400_000);
  return Math.max(0, 14 - diffDays * 2);
}

function categoryBoost(category) {
  if (category === "演出音乐") return 14;
  if (category === "展览") return 10;
  if (category === "线下活动") return 6;
  return 0;
}

function scoreEvent(event, now) {
  let score = 0;
  const sources = Array.isArray(event.sources) ? event.sources : [];
  const hour = shanghaiHour(event.start_time);
  const day = shanghaiDay(event.start_time);
  const title = event.title || "";

  // 多源交叉验证：同一个活动被越多源报到，越可信
  score += Math.min(sources.length || 1, 4) * 8;
  // 一手源（场馆/高校官网）比聚合器更权威，温和加权让同分时一手源靠前
  if (sources.some((source) => source && source.tier === "T1")) score += 12;
  score += categoryBoost(event.category);
  score += event.signup_url ? 6 : 0;
  score += event.image_url ? COVER_IMAGE_BOOST : 0;
  score += day === 0 || day === 6 ? 10 : 0;
  score += hour >= 18 ? 8 : 0;
  score += proximityScore(event.start_time, now);

  for (const [keyword, weight] of KEYWORD_WEIGHTS) {
    if (title.indexOf(keyword) >= 0) score += weight;
  }

  if (hasCjkText(title)) score += CHINESE_TITLE_BOOST;

  return score;
}

function byStartTimeAsc(left, right) {
  return new Date(left.start_time).getTime() - new Date(right.start_time).getTime();
}

function rankRecommended(events, now) {
  return events
    .map((event) => ({ event, score: scoreEvent(event, now) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.event);
}

// 与 Web 的 getDisplayTopPicks 一致：先按评分降序，再把中文标题的稳定提到前面
// （国外聚合源的无中文条目标题可读性差，不该占着首屏）
function sortRecommended(events, now = new Date()) {
  const ranked = rankRecommended(events, now);
  const chinese = ranked.filter((event) => hasCjkText(event.title));
  const other = ranked.filter((event) => !hasCjkText(event.title));
  return [...chinese, ...other];
}

// 高校讲座：AI 相关优先置顶，其余未发生的按时间升序、已发生的排后
// （与 Web 端 src/lib/recommendations.js 的 sortCampusLectures 规则一致）
function sortCampusLectures(events, now = new Date()) {
  const today = format.toShanghaiDate(now);
  const upcoming = [];
  const past = [];
  for (const event of events) {
    if (format.toShanghaiDate(event.start_time) >= today) upcoming.push(event);
    else past.push(event);
  }
  upcoming.sort(byStartTimeAsc);
  past.sort((left, right) => new Date(right.start_time).getTime() - new Date(left.start_time).getTime());

  const timeSorted = [...upcoming, ...past];
  const isAiLecture = (event) =>
    AI_LECTURE_KEYWORDS.test(event.title || "") || AI_LECTURE_KEYWORDS.test(event.summary || "");
  return [...timeSorted.filter(isAiLecture), ...timeSorted.filter((event) => !isAiLecture(event))];
}

// 展览：有封面图的优先展示，其余按开始时间（「最新」档用）
function sortExhibitions(events) {
  return [...events].sort((left, right) => {
    const leftImage = left.image_url ? 1 : 0;
    const rightImage = right.image_url ? 1 : 0;
    return rightImage - leftImage || byStartTimeAsc(left, right);
  });
}

/**
 * 列表排序入口。
 *
 * mode = "recommended"（默认）：按评分推荐，让多源验证过、有一手源、有封面、
 *                                临近周末/晚上的活动浮上来。
 * mode = "latest"：严格按开始时间升序，用户想按日程看时用这一档。
 *
 * 例外：高校讲座在两档下都走 sortCampusLectures —— 讲座的用户意图是「锁定最近一场」，
 * 不是「看推荐」，AI 相关置顶比评分更贴合需求（与 Web 类目页行为一致）。
 */
function sortForCategory(events, category, { mode = "recommended", now = new Date() } = {}) {
  if (category === "高校讲座") return sortCampusLectures(events, now);
  if (mode === "latest") {
    return category === "展览" ? sortExhibitions(events) : [...events].sort(byStartTimeAsc);
  }
  return sortRecommended(events, now);
}

module.exports = { sortForCategory, scoreEvent, sortRecommended };
