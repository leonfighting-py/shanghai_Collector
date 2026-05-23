import { filterPublishableEvents, isInDateRange, mergeDuplicateEvents, toShanghaiWeekRange } from "./events.js";

export const SOURCE_SEEDS = [
  {
    name: "猫眼演出",
    url: "https://show.maoyan.com/",
    category: "演出音乐",
    parser: parseJsonLdEvents,
  },
  {
    name: "豆瓣同城上海",
    url: "https://shanghai.douban.com/",
    category: "演出音乐",
    parser: parseReadableDateBlocks,
  },
  {
    name: "SmartShanghai Events",
    url: "https://www.smartshanghai.com/events/",
    category: "演出音乐",
    parser: parseReadableDateBlocks,
  },
  {
    name: "AllEvents Shanghai",
    url: "https://allevents.in/shanghai",
    category: "演出音乐",
    parser: parseReadableDateBlocks,
  },
  {
    name: "Fotografiska Shanghai",
    url: "https://shanghai.fotografiska.com/en/whats-on",
    category: "展览",
    parser: parseReadableDateBlocks,
  },
  {
    name: "复星艺术中心",
    url: "https://www.fosunfoundation.com/",
    category: "展览",
    parser: parseReadableDateBlocks,
  },
  {
    name: "上海外滩美术馆",
    url: "https://www.rockbundartmuseum.org/",
    category: "展览",
    parser: parseReadableDateBlocks,
  },
  {
    name: "teamLab 无界上海",
    url: "https://art.team-lab.cn/e/borderless-shanghai/",
    category: "展览",
    parser: parseReadableDateBlocks,
  },
  {
    name: "上海文旅局",
    url: "https://whlyj.sh.gov.cn/",
    category: "线下活动",
    parser: parseReadableDateBlocks,
  },
  {
    name: "上海发布活动",
    url: "https://www.shanghai.gov.cn/",
    category: "线下活动",
    parser: parseReadableDateBlocks,
  },
  {
    name: "活动网上海",
    url: "https://huodong.com/shanghai",
    category: "线下活动",
    parser: parseReadableDateBlocks,
  },
  {
    name: "10times Shanghai",
    url: "https://10times.com/shanghai-cn",
    category: "线下活动",
    parser: parseReadableDateBlocks,
  },
  {
    name: "NYU Shanghai Events",
    url: "https://events.shanghai.nyu.edu/",
    category: "高校讲座",
    parser: parseReadableDateBlocks,
  },
  {
    name: "上外活动平台",
    url: "https://event.shisu.edu.cn/",
    category: "高校讲座",
    parser: parseReadableDateBlocks,
  },
  {
    name: "上海交通大学活动",
    url: "https://gc.sjtu.edu.cn/cn/event/",
    category: "高校讲座",
    parser: parseReadableDateBlocks,
  },
  {
    name: "上海交通大学大师讲坛",
    url: "https://www.gs.sjtu.edu.cn/dsjt",
    category: "高校讲座",
    parser: parseReadableDateBlocks,
  },
];

export async function collectEventsFromSources({
  sources = SOURCE_SEEDS,
  previousEvents = [],
  fetchHtml = defaultFetchHtml,
  now = new Date(),
} = {}) {
  const { startDate, endDate } = toShanghaiWeekRange(now);
  const failures = [];
  const collected = [];

  for (const source of sources) {
    try {
      const html = await fetchHtml(source.url);
      const parsed = await source.parser(html, source);
      collected.push(...parsed);
    } catch (error) {
      failures.push({
        source: source.name,
        url: source.url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const events = mergeDuplicateEvents(
    filterPublishableEvents(collected).filter((event) => isInDateRange(event, startDate, endDate)),
  );

  if (events.length === 0 && previousEvents.length > 0) {
    return {
      ok: false,
      events: previousEvents,
      failures,
      collectedCount: 0,
      publishedCount: previousEvents.length,
      startDate,
      endDate,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    ok: failures.length === 0,
    events,
    failures,
    rawEvents: collected,
    collectedCount: collected.length,
    publishedCount: events.length,
    startDate,
    endDate,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export async function defaultFetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ShanghaiWeeklyEventsBot/0.1 (+public event aggregation)",
      accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export function parseJsonLdEvents(html, source) {
  const events = [];
  const scriptMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of scriptMatches) {
    const text = stripHtml(match[1]);
    try {
      const data = JSON.parse(text);
      const candidates = Array.isArray(data) ? data : [data];
      for (const candidate of candidates.flatMap(expandGraph)) {
        if (!isEventLike(candidate)) continue;
        events.push(fromStructuredEvent(candidate, source));
      }
    } catch {
      // Ignore malformed embedded JSON; source-level failure should not block other parsers.
    }
  }

  return events;
}

export function parseReadableDateBlocks(html, source) {
  const text = stripHtml(html)
    .replace(/\s+/g, " ")
    .replace(/(202[6-9][./-]\d{1,2}[./-]\d{1,2})/g, "\n$1");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  return lines
    .map((line) => {
      const date = line.match(/(202[6-9])[./-](\d{1,2})[./-](\d{1,2})/);
      if (!date) return null;
      const title = line.replace(date[0], "").slice(0, 80).trim();
      if (!title || title.length < 4) return null;
      return {
        title,
        start_time: `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}T10:00:00+08:00`,
        end_time: null,
        venue: "上海",
        category: source.category,
        signup_url: source.url,
        source_name: source.name,
        source_url: source.url,
      };
    })
    .filter(Boolean);
}

function expandGraph(candidate) {
  if (candidate?.["@graph"]) return candidate["@graph"];
  if (candidate?.itemListElement) return candidate.itemListElement.map((item) => item.item || item);
  return [candidate];
}

function isEventLike(candidate) {
  const type = candidate?.["@type"];
  return type === "Event" || (Array.isArray(type) && type.includes("Event"));
}

function fromStructuredEvent(candidate, source) {
  const location = candidate.location;
  const venue = typeof location === "string" ? location : location?.name || location?.address?.name || "上海";
  return {
    title: candidate.name,
    start_time: candidate.startDate,
    end_time: candidate.endDate || null,
    venue,
    category: source.category,
    signup_url: candidate.url || source.url,
    source_name: source.name,
    source_url: candidate.url || source.url,
  };
}

function stripHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script(?![^>]+application\/ld\+json)[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}
