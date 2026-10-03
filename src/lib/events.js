import { inferEventEndTime } from "./event-duration.js";

export const CATEGORIES = ["演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"];
export const COLLECTION_WINDOW_DAYS = 14;

const TIER_RANK = { T1: 2, T2: 1 };
export function tierRank(tier) {
  return TIER_RANK[tier] || 0;
}

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[·•｜|:：,，.。!！?？"'“”‘’()（）\[\]【】\s-]/g, "")
    .trim();
}

export function toShanghaiDate(input) {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 10);
}

export function toShanghaiWeekRange(input = new Date()) {
  const shanghaiDate = toShanghaiDate(input);
  const noonUtc = new Date(`${shanghaiDate}T04:00:00.000Z`);
  const day = noonUtc.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const start = new Date(noonUtc);
  start.setUTCDate(noonUtc.getUTCDate() - daysFromMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/** Rolling publish window: anchor day plus the next `days - 1` days in Shanghai. */
export function toShanghaiDayWindow(input = new Date(), days = COLLECTION_WINDOW_DAYS) {
  const startDate = toShanghaiDate(input);
  const start = new Date(`${startDate}T04:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + Math.max(days, 1) - 1);

  return {
    startDate,
    endDate: end.toISOString().slice(0, 10),
    days,
  };
}

export function buildDedupeKey(event) {
  const title = normalizeText(event.title);
  const date = toShanghaiDate(event.start_time);
  const venue = normalizeText(event.venue);
  return [title, date, venue].join("|");
}

const NEWS_TITLE_PATTERNS = [
  /通知$/,
  /公告$/,
  /公示$/,
  /关于印发/,
  /关于.*的通知/,
  /价格的通知/,
  /政策解读/,
  /新闻发布会/,
  /人民政府/,
  /委员会关于/,
  /发改委/,
  /条例$/,
  /办法$/,
  /规定$/,
  /批复$/,
  /schema\.org/i,
  /availabilityends/i,
  /validfrom/i,
  /eventstatus/i,
  /^t\d{2}:\d{2}:\d{2}/i,
  /^[\s",{\[\]\\/]+/,
  /thank you for your feedback/i,
  /跳转到主要内容/,
];

// 内容守门：聚合平台（Eventbrite / AllEvents 等）上混入的成人向、夜店拉客、
// 擦边导览类条目，与本项目的面向公众的活动定位不符，一律不予发布。
// 背景：2026-10 实测发现同一发布者在 Eventbrite 上海频道大量灌入
// 「BDSM Tour」「Pub Crawl」类条目，既有源（Eventbrite Shanghai 等）已被污染。
const OFF_TOPIC_TITLE_RE =
  /\b(bdsm|dominatrix|mistress|domme|femdom|fetish|kink|kinky|submissive|dominant\s*&\s*sub|es?cort|swinger|orgy|strip\s*club|lap\s*dance|eproctophilia|e-?stim)\b|pub\s*crawl|bar\s*hopping|nightlife\s*tour|脱衣舞|夜店/i;

export function isOffTopicEvent(event) {
  if (OFF_TOPIC_TITLE_RE.test(event?.title || "")) return true;
  if (OFF_TOPIC_TITLE_RE.test(event?.venue || "")) return true;
  return false;
}

// 上海地域过滤：聚合器（Eventbrite / 活动行等）的地域标记不严，外地活动常混入。
// 发布前用规则兜底——提取 venue + title + summary，先剔除与外地重名的上海地名
// （南京路 / 苏州河 / 江苏路 等），再判定：出现外地省市且不含任何上海标记 → 非上海。
// 保守策略：只要文本里出现任何上海标记就一律保留，宁可放过也不误杀本地活动。
const SHANGHAI_MARKERS = [
  "上海", "沪", "申城", "魔都",
  "浦东", "徐汇", "静安", "黄浦", "长宁", "虹口", "杨浦",
  "闵行", "宝山", "嘉定", "松江", "青浦", "奉贤", "金山", "崇明", "普陀",
  "世博", "大宁", "大虹桥", "陆家嘴", "外滩", "新天地", "迪士尼",
];

const NON_SHANGHAI_REGIONS = [
  "北京", "天津", "重庆",
  "广东", "广州", "深圳", "东莞", "佛山", "珠海",
  "山东", "济南", "青岛", "烟台", "潍坊", "临沂",
  "浙江", "杭州", "宁波", "温州", "绍兴", "嘉兴",
  "江苏", "南京", "苏州", "无锡", "常州", "南通", "扬州", "徐州",
  "四川", "成都", "绵阳",
  "湖北", "武汉",
  "湖南", "长沙",
  "福建", "福州", "厦门", "泉州",
  "陕西", "西安",
  "辽宁", "沈阳", "大连",
  "河南", "郑州", "洛阳",
  "安徽", "合肥",
  "河北", "石家庄", "唐山",
  "山西", "太原",
  "江西", "南昌",
  "广西", "南宁",
  "黑龙江", "哈尔滨",
  "吉林", "长春",
  "云南", "昆明",
  "贵州", "贵阳",
  "甘肃", "兰州",
  "青海", "西宁",
  "海口", "三亚",
  "新疆", "乌鲁木齐",
  "西藏", "拉萨",
  "内蒙古", "呼和浩特",
  "宁夏", "银川",
  "香港", "澳门", "台湾", "台北",
];

// 上海含外地词的地名（路名 / 地标）：判定前从文本里剔除，避免被误判为外地活动。
const SHANGHAI_PLACE_OVERRIDE = [
  /南京[东西]?路/g, /南苏州路/g, /苏州河/g, /江苏路/g,
  /威海路/g, /中山公园/g, /中山医院/g, /中山北路/g, /中山南路/g,
];

export function isShanghaiRelevantEvent(event) {
  const raw = `${event?.venue || ""} ${event?.title || ""} ${event?.summary || ""}`;
  if (SHANGHAI_MARKERS.some((marker) => raw.includes(marker)) || /shanghai/i.test(raw)) {
    return true;
  }
  const cleaned = SHANGHAI_PLACE_OVERRIDE.reduce((text, pattern) => text.replace(pattern, ""), raw);
  return !NON_SHANGHAI_REGIONS.some((region) => cleaned.includes(region));
}

export function isEventLikeTitle(title = "") {
  const text = String(title).trim();
  if (text.length < 6 || text.length > 120) return false;
  if (NEWS_TITLE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (/&#\d+;/.test(text)) return false;
  if (!/[a-zA-Z\u4e00-\u9fff]{2,}/.test(text)) return false;

  const specialChars = (text.match(/[\\"{}\[\]:,]/g) || []).length;
  if (specialChars >= 3) return false;

  return true;
}

export function isPublishableEvent(event) {
  return Boolean(
    event?.title?.trim() &&
      isEventLikeTitle(event.title) &&
      !isOffTopicEvent(event) &&
      isShanghaiRelevantEvent(event) &&
      event?.start_time &&
      event?.venue?.trim() &&
      event?.category &&
      CATEGORIES.includes(event.category) &&
      event?.signup_url?.trim() &&
      event?.source_name?.trim() &&
      event?.source_url?.trim(),
  );
}

export function filterPublishableEvents(events) {
  return events.filter(isPublishableEvent).map((event) => {
    const dedupeKey = event.dedupe_key || buildDedupeKey(event);
    return {
      ...event,
      dedupe_key: dedupeKey,
      // 长期活动（展览 / 驻场演出）源页面常只给开始日，这里补齐约 3 个月的结束时间。
      // 单场活动仍返回 null，由 coalesce(end_time, start_time) 兜底 —— 详见 event-duration.js
      end_time: inferEventEndTime(event),
      sources: normalizeSources(event),
    };
  });
}

export function mergeDuplicateEvents(events) {
  const merged = new Map();

  for (const event of events) {
    const key = event.dedupe_key || buildDedupeKey(event);
    const current = merged.get(key);

    if (!current) {
      merged.set(key, {
        ...event,
        dedupe_key: key,
        sources: normalizeSources(event),
      });
      continue;
    }

    current.sources = mergeSources(current.sources, normalizeSources(event));

    // 一手源（T1）字段优先于聚合器（T2）：场馆/高校官网的时间、摘要、封面比聚合器更权威
    if (tierRank(event.source_tier) > tierRank(current.source_tier)) {
      if (event.end_time) current.end_time = event.end_time;
      if (event.summary) current.summary = event.summary;
      if (event.image_url) current.image_url = event.image_url;
    } else {
      if (!current.end_time && event.end_time) current.end_time = event.end_time;
      if (!current.summary && event.summary) current.summary = event.summary;
      if (!current.image_url && event.image_url) current.image_url = event.image_url;
    }
  }

  return [...merged.values()].sort(
    (left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime(),
  );
}

function normalizeSources(event) {
  const existing = Array.isArray(event.sources) ? event.sources : [];
  return mergeSources(existing, [
    {
      name: event.source_name,
      url: event.source_url || event.signup_url,
      tier: event.source_tier,
    },
  ]);
}

function mergeSources(left, right) {
  const seen = new Set();
  const sources = [];

  for (const source of [...left, ...right]) {
    if (!source?.name || !source?.url) continue;
    const key = `${source.name}|${source.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(
      source.tier ? { name: source.name, url: source.url, tier: source.tier } : { name: source.name, url: source.url },
    );
  }

  return sources;
}

// 与 repository.js 的 buildEventWindowWhereSql **必须同口径**：
//   start_time <= endDate 且 coalesce(end_time, start_time) >= startDate。
//
// 为什么不能各自一套：replaceWeekEvents 会先按读窗口 delete from events，再由本函数
// 决定把哪些采回来的活动插回去。只要发布口径比读窗口窄，落在两者差集里的行就会被
// 「删掉且永远不再写回」—— 典型受害者是开口超过 60 天、但仍在展的长期展览
// （旧实现的「展览回看 60 天」分支正是这么把 2026-07-08→2027-11-13 这类展览吃掉的）。
//
// 已结束的活动如何保留由 cleanupOldData 的 7 天存储缓冲统一负责，不进展示口径。
export function isInDateRange(event, startDate, endDate) {
  const start = toShanghaiDate(event.start_time);
  if (!start) return false;
  if (start > endDate) return false;

  const end = toShanghaiDate(event.end_time) || start;
  return end >= startDate;
}

export function getWeekDays(startDate) {
  const start = new Date(`${startDate}T04:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

/** 外链安全：活动链接只接受 http(s)，其余（如 javascript:）退化为 # */
export function safeExternalUrl(url) {
  const text = String(url || "").trim();
  return /^https?:\/\//i.test(text) ? text : "#";
}
