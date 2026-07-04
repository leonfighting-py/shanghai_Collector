export const CATEGORIES = ["演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"];
export const COLLECTION_WINDOW_DAYS = 14;

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
    if (!current.end_time && event.end_time) current.end_time = event.end_time;
    if (!current.summary && event.summary) current.summary = event.summary;
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
    sources.push({ name: source.name, url: source.url });
  }

  return sources;
}

export function isInDateRange(event, startDate, endDate) {
  const eventDate = toShanghaiDate(event.start_time);
  if (eventDate >= startDate && eventDate <= endDate) return true;

  if (event.category === "展览" && eventDate && eventDate < startDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const opened = new Date(`${eventDate}T00:00:00.000Z`);
    const daysSinceOpening = Math.floor((start.getTime() - opened.getTime()) / 86_400_000);
    return daysSinceOpening <= 60;
  }

  return false;
}

export function getWeekDays(startDate) {
  const start = new Date(`${startDate}T04:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
