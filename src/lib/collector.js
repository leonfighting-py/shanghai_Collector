import {
  filterPublishableEvents,
  isInDateRange,
  mergeDuplicateEvents,
  toShanghaiDayWindow,
} from "./events.js";
import { defaultFetchHtml } from "./fetch-html.js";
import { PARSERS } from "./parsers/index.js";

export { defaultFetchHtml } from "./fetch-html.js";
export { parseJsonLdEvents } from "./parsers/json-ld.js";

export const SOURCE_SEEDS = [
  { name: "猫眼演出", url: "https://show.maoyan.com/", category: "演出音乐", locale: "zh", parser: PARSERS.maoyan },
  {
    name: "秀动上海",
    url: "https://www.showstart.com/event/list?cityCode=310000",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.showstart,
  },
  {
    name: "豆瓣同城上海",
    url: "https://www.douban.com/location/shanghai/events",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.douban,
  },
  {
    name: "SmartShanghai Events",
    url: "https://www.smartshanghai.com/events/",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.smartshanghai,
  },
  {
    name: "SmartShanghai Live Music",
    url: "https://www.smartshanghai.com/events/?category=live-music",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.smartshanghai,
  },
  { name: "AllEvents Shanghai", url: "https://allevents.in/shanghai", category: "演出音乐", locale: "en", parser: PARSERS.allevents },
  {
    name: "Eventbrite Shanghai Music",
    url: "https://www.eventbrite.com/d/china--shanghai/music--events/",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  {
    name: "复星艺术中心",
    url: "https://www.fosunfoundation.com/zh/current-exhibitions",
    category: "展览",
    locale: "zh",
    parser: PARSERS.fosun,
  },
  {
    name: "上海外滩美术馆",
    url: "https://www.rockbundartmuseum.org/exhibitions/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.rockbund,
  },
  {
    name: "teamLab 无界上海",
    url: "https://art.team-lab.cn/e/borderless-shanghai/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.teamlab,
  },
  {
    name: "上海当代艺术博物馆",
    url: "https://www.powerstationofart.com/exhibitions.html",
    category: "展览",
    locale: "zh",
    parser: PARSERS.psa,
  },
  {
    name: "中华艺术宫",
    url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
    category: "展览",
    locale: "zh",
    parser: PARSERS.chinaArtMuseum,
  },
  {
    name: "浦东美术馆",
    url: "https://www.museumofartpd.org.cn/exhibition",
    category: "展览",
    locale: "zh",
    parser: PARSERS.map,
  },
  {
    name: "UCCA Edge 上海",
    url: "https://ucca.org.cn/exhibitions/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.ucca,
  },
  {
    name: "Fotografiska 上海",
    url: "https://shanghai.fotografiska.com/en/whats-on",
    category: "展览",
    locale: "zh",
    parser: PARSERS.fotografiska,
  },
  {
    name: "上海本地宝·活动",
    url: "https://sh.bendibao.com/xiuxian/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.bendibao,
    notes: "替代公众号「上海本地宝」",
  },
  {
    name: "上海本地宝·周末活动",
    url: "https://sh.bendibao.com/xiuxian/zhoumohd/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.bendibao,
    notes: "替代公众号「上海本地宝」周末推荐",
  },
  {
    name: "上海本地宝·市集",
    url: "https://sh.bendibao.com/xiuxian/shiji/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.bendibao,
    notes: "替代公众号「魔都探索队」等市集合集",
  },
  {
    name: "上海本地宝·音乐演出",
    url: "https://sh.bendibao.com/xiuxian/yinyueyanchu/",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.bendibao,
    notes: "替代公众号「MAOLivehouse上海」等演出合集",
  },
  {
    name: "上海本地宝·展览",
    url: "https://sh.bendibao.com/xiuxian/zhanlan/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.bendibao,
    notes: "替代公众号「ShanghaiLOOK」等展览合集",
  },
  {
    name: "上海本地宝·展会活动",
    url: "https://sh.bendibao.com/xiuxian/zhanhui/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.bendibao,
    notes: "替代公众号「ShanghaiWOW」等活动清单",
  },
  {
    name: "大麦上海",
    url: "https://www.damai.cn/search.html?city=上海&order=1",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.damai,
    notes: "替代「走起Go」等平台的票务演出",
  },
  {
    name: "活动行上海",
    url: "https://www.huodongxing.com/events?orderby=hot&city=%E4%B8%8A%E6%B5%B7",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "替代「走起Go」等活动平台",
  },
  {
    name: "互动吧上海",
    url: "https://www.huodong.com/event?cityCode=310000",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.huodongBa,
  },
  {
    name: "Eventbrite Shanghai",
    url: "https://www.eventbrite.com/d/china--shanghai/events/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  {
    name: "Eventbrite Shanghai Business",
    url: "https://www.eventbrite.com/d/china--shanghai/business--events/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  {
    name: "Eventbrite Shanghai Networking",
    url: "https://www.eventbrite.com/d/china--shanghai/networking--events/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  { name: "Lu.ma Shanghai", url: "https://lu.ma/shanghai", category: "线下活动", locale: "en", parser: PARSERS.luma },
  { name: "NYU Shanghai Events", url: "https://events.shanghai.nyu.edu/", category: "高校讲座", locale: "en", parser: PARSERS.nyu },
  { name: "上外活动平台", url: "https://event.shisu.edu.cn/", category: "高校讲座", locale: "zh", parser: PARSERS.shisu },
  { name: "上海交通大学活动", url: "https://gc.sjtu.edu.cn/cn/event/", category: "高校讲座", locale: "zh", parser: PARSERS.sjtu },
  {
    name: "同济大学活动",
    url: "https://see.tongji.edu.cn/index/jqzyhd.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.tongjiSee,
  },
  {
    name: "AI Tinkerers Shanghai",
    url: "https://www.meetup.com/topics/artificial-intelligence/shanghai/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.aitinkerers,
  },
  {
    name: "ShanghAI AI Meetup",
    url: "https://www.meetup.com/shanghai-ai/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.meetup,
  },
  { name: "OpenClaw Shanghai", url: "https://lu.ma/shanghai", category: "AI聚会", locale: "en", parser: PARSERS.luma },
  {
    name: "Eventbrite Shanghai AI",
    url: "https://www.eventbrite.com/d/china--shanghai/artificial-intelligence--events/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.eventbriteAiTech,
  },
  {
    name: "Eventbrite Shanghai Tech",
    url: "https://www.eventbrite.com/d/china--shanghai/science-and-tech--events/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.eventbriteAiTech,
  },
  ...(process.env.WECHAT_EVENTS_API_URL || process.env.WECHAT_EXPORTER_AUTH_KEY
    ? [
        {
          name: "微信公众号活动",
          url: process.env.WECHAT_EVENTS_API_URL || process.env.WECHAT_EXPORTER_BASE_URL || "http://localhost:3001",
          category: process.env.WECHAT_DEFAULT_CATEGORY || "线下活动",
          locale: "zh",
          parser: PARSERS.wechat,
          timeoutMs: 180_000,
        },
      ]
    : []),
];

async function withSourceTimeout(task, sourceName, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${sourceName} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function collectEventsFromSources({
  sources = SOURCE_SEEDS,
  previousEvents = [],
  fetchHtml = defaultFetchHtml,
  now = new Date(),
} = {}) {
  const { startDate, endDate, days } = toShanghaiDayWindow(now);
  const failures = [];
  const collected = [];

  for (const source of sources) {
    try {
      const parsed = await withSourceTimeout(
        async () => {
          const html = await fetchHtml(source.url);
          return source.parser(html, source, { fetchHtml, now, window: { startDate, endDate, days } });
        },
        source.name,
        source.timeoutMs || 45_000,
      );
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
      windowDays: days,
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
    windowDays: days,
    lastUpdatedAt: new Date().toISOString(),
  };
}
