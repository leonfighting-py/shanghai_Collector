import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseBendibaoShanghai, extractEventsFromBendibaoArticle, parseBendibaoDateRange } from "../src/lib/parsers/bendibao.js";
import { parseDoubanShanghai } from "../src/lib/parsers/douban.js";
import { parseEventbriteAiTech } from "../src/lib/parsers/eventbrite.js";
import { parseJsonLdEvents } from "../src/lib/parsers/json-ld.js";
import { parseMaoyan } from "../src/lib/parsers/maoyan.js";
import { parseHuodongxing } from "../src/lib/parsers/huodongxing.js";
import { parseShcstheatre } from "../src/lib/parsers/shcstheatre.js";
import { parseSmartShanghai } from "../src/lib/parsers/smartshanghai.js";
import { isEventLikeTitle } from "../src/lib/events.js";
import { buildEvent, parseFlexibleDate, isRelevantPerformance } from "../src/lib/parsers/shared.js";
import { parseChinaArtMuseumExhibitions } from "../src/lib/parsers/artmuseumonline.js";
import { parseMapExhibitions } from "../src/lib/parsers/map.js";
import { parseGdgShanghai } from "../src/lib/parsers/gdg-shanghai.js";
import { parseSiiCalendar } from "../src/lib/parsers/sii-calendar.js";
import { parseShlabEvents } from "../src/lib/parsers/shlab.js";
import { parseCnCmsLectures } from "../src/lib/parsers/cn-cms-lectures.js";
import { parseShlibActivity } from "../src/lib/parsers/shlib-activity.js";
import { parseJiadingLibraryLectures } from "../src/lib/parsers/jiading-library.js";
import { parsePowerlongMuseum } from "../src/lib/parsers/powerlong-museum.js";
import { parseIicShanghai } from "../src/lib/parsers/iic-shanghai.js";
import { parseHuodongBa } from "../src/lib/parsers/huodongba.js";
import { parseRockbundArtMuseum } from "../src/lib/parsers/rockbund.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("json-ld parser extracts structured events", () => {
  const html = `<script type="application/ld+json">{"@type":"Event","name":"Epica Live","startDate":"2026-06-14T19:00:00+08:00","location":{"name":"虹口足球场"},"url":"https://example.com/epica"}</script>`;
  const events = parseJsonLdEvents(html, {
    name: "AllEvents",
    url: "https://allevents.in/shanghai",
    category: "演出音乐",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Epica Live");
});

test("maoyan parser reads embedded performance json", async () => {
  const html = `{"performanceName":"周末爵士之夜现场演出","showTime":"2026-06-14 19:30","theaterName":"上海大剧院","city":"上海"}`;
  const events = await parseMaoyan(html, { name: "猫眼", url: "https://show.maoyan.com/", category: "演出音乐" });
  assert.equal(events.length, 1);
  assert.equal(events[0].venue, "上海大剧院");
});

test("douban parser fetches event detail pages", async () => {
  const listHtml = fixture("douban-list.html");
  const detailHtml = fixture("douban-event.html");
  const events = await parseDoubanShanghai(
    listHtml,
    { name: "豆瓣同城上海", url: "https://www.douban.com/location/shanghai/events", category: "演出音乐" },
    { fetchHtml: async () => detailHtml },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "爵士之夜现场演出");
});

// 互动吧（活动网）2026-10 改版回归测试。
// 改版三点：① `?cityCode=` 参数失效，只有路径式城市维度可用；② 列表页只剩
// `<article class="activity-card">` 卡片，日期是「展至 10月29日」这类**相对文案**；
// ③ 详情页才有 schema.org Event JSON-LD（含准确起止日）。
const HUODONGBA_SOURCE = {
  name: "互动吧上海",
  url: "https://huodong.com/event/shanghai",
  category: "线下活动",
  tier: "T2",
};
const HUODONGBA_LIST = `
  <div class="event-list">
    <article class="activity-card">
      <a class="card-hit" href="/event/detail/eyufp"
         aria-label="浸入式音乐秀《双城之战》" data-growth-code="eyufp"></a>
      <h3 class="activity-title">浸入式音乐秀《双城之战》</h3>
      <p class="activity-meta"><span class="meta-date">展至 10月29日</span>
        <span class="meta-location" title="上海 · 静安区">上海 · 静安区</span></p>
    </article>
    <article class="activity-card">
      <a class="card-hit" href="/event/detail/eykRE" aria-label="舞台剧《诺曼底公寓》"></a>
      <h3 class="activity-title">舞台剧《诺曼底公寓》</h3>
      <p class="activity-meta"><span class="meta-date">展至 10月11日</span>
        <span class="meta-location" title="上海 · 徐汇区">上海 · 徐汇区</span></p>
    </article>
  </div>`;
const HUODONGBA_DETAILS = {
  "https://huodong.com/event/detail/eyufp": `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"浸入式音乐秀《双城之战》","startDate":"2026-09-30","endDate":"2026-10-29","location":{"@type":"Place","name":"上海市静安区乌鲁木齐北路505号上海宾馆"}}</script>`,
  "https://huodong.com/event/detail/eykRE": `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"舞台剧《诺曼底公寓》","startDate":"2026-09-29","endDate":"2026-10-11","location":{"@type":"Place","name":"上海市徐汇区安福路288号 上海话剧艺术中心"}}</script>`,
};

test("huodongba parser reads activity cards then schema.org Event from each detail page", async () => {
  const events = await parseHuodongBa(HUODONGBA_LIST, HUODONGBA_SOURCE, {
    fetchHtml: async (url) => HUODONGBA_DETAILS[url],
  });

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.title),
    ["浸入式音乐秀《双城之战》", "舞台剧《诺曼底公寓》"],
  );
  // 开始日必须来自详情页 JSON-LD，而不是列表页的「展至 X」（那是结束日）
  assert.match(events[0].start_time, /^2026-09-30/);
  assert.match(events[0].end_time, /^2026-10-29/);
  // 报名链接必须指向该条详情页；回落成列表页会让所有条目的链接撞在一起
  assert.equal(events[0].signup_url, "https://huodong.com/event/detail/eyufp");
  assert.equal(events[1].signup_url, "https://huodong.com/event/detail/eykRE");
});

test("huodongba parser skips detail pages that fail, keeping the rest", async () => {
  const events = await parseHuodongBa(HUODONGBA_LIST, HUODONGBA_SOURCE, {
    fetchHtml: async (url) => {
      if (url.endsWith("eyufp")) throw new Error("HTTP 500");
      return HUODONGBA_DETAILS[url];
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "舞台剧《诺曼底公寓》");
});

test("huodongba parser does not fall back to scraping legacy detail links", async () => {
  // 反向守卫：改版前的列表是 <a href="/event/detail/xxx">标题</a> 直接挂在 <li> 上。
  // 解析器必须**只认 activity-card 卡片**——若放开成「见 detail 链接就抓」，
  // 又会退回当年那套「靠详情页 <h1>/日期正则猜字段」的老路，那套在改版后已经抓不到东西。
  const legacyList = `<ul class="event_list"><li><a href="/event/detail/abc123">某活动</a></li></ul>`;
  const events = await parseHuodongBa(legacyList, HUODONGBA_SOURCE, {
    fetchHtml: async () => HUODONGBA_DETAILS["https://huodong.com/event/detail/eyufp"],
  });

  assert.equal(events.length, 0);
});

// 上海外滩美术馆：站点 2026-10 改为客户端渲染，官网 HTML 已无展览数据，
// 改直连其 Sanity 公开数据集（一次请求返回 JSON），这里钉住 JSON → 事件的翻译。
test("rockbund parser reads exhibitions from the sanity query payload", () => {
  const body = JSON.stringify({
    result: [
      {
        title: "约塔·蒙巴萨：（在潮汐里）困于流动中",
        slug: "jota-mombaca-stuck-in-movement-in-the-tide",
        startDate: "2026-10-31",
        endDate: "2027-02-21",
        venue: "上海外滩美术馆",
        image: "https://cdn.sanity.io/images/fvrm4fsf/production/x.jpg",
      },
    ],
  });

  const events = parseRockbundArtMuseum(body, {
    name: "上海外滩美术馆",
    url: "https://fvrm4fsf.apicdn.sanity.io/v2021-10-21/data/query/production?query=x",
    category: "展览",
    tier: "T1",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].venue, "上海外滩美术馆");
  assert.match(events[0].start_time, /^2026-10-31/);
  assert.match(events[0].end_time, /^2027-02-21/);
  assert.equal(
    events[0].signup_url,
    "https://www.rockbundartmuseum.org/exhibitions/jota-mombaca-stuck-in-movement-in-the-tide",
  );
});

test("rockbund parser stays quiet when the endpoint returns non-json", () => {
  // 接口异常（反爬页/网关错误）时静默返回空，交给健康报告呈现，不抛错中断整批采集
  assert.deepEqual(
    parseRockbundArtMuseum("<html>403 Forbidden</html>", {
      name: "上海外滩美术馆",
      url: "https://fvrm4fsf.apicdn.sanity.io/x",
      category: "展览",
    }),
    [],
  );
});

test("smartshanghai parser reads event cards from list page", () => {
  const events = parseSmartShanghai(fixture("smartshanghai-list.html"), {
    name: "SmartShanghai Events",
    url: "https://www.smartshanghai.com/events/",
    category: "演出音乐",
  });

  assert.equal(events.length, 1);
  assert.match(events[0].title, /Jazz/);
  assert.equal(events[0].venue, "JZ Club Shanghai");
});

test("eventbrite ai tech parser filters unrelated city events", () => {
  const html = `<script type="application/ld+json">[
    {"@type":"Event","name":"Shanghai Tech Mixer and Social","startDate":"2026-06-20T19:00:00+08:00","location":{"name":"Club Room"},"url":"https://example.com/tech"},
    {"@type":"Event","name":"Intro to unrelated nightlife dynamics","startDate":"2026-06-20T19:00:00+08:00","location":{"name":"Shanghai"},"url":"https://example.com/nightlife"}
  ]</script>`;
  const events = parseEventbriteAiTech(html, {
    name: "Eventbrite Shanghai AI",
    url: "https://www.eventbrite.com/d/china--shanghai/artificial-intelligence--events/",
    category: "AI聚会",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Shanghai Tech Mixer and Social");
});

test("invalid parsed dates are rejected before publish", () => {
  assert.equal(parseFlexibleDate("2016-01-54"), null);
  assert.equal(
    buildEvent({
      title: "周末展览开幕",
      start_time: "2016-01-54T10:00:00+08:00",
      venue: "上海",
      signup_url: "https://example.com/event",
      source: { name: "测试源", url: "https://example.com", category: "展览" },
    }),
    null,
  );
});

test("map parser reads exhibition cards from list page", () => {
  const html = `<a href="/exhibitiondetail?id=216" class="link"><img alt="乔治·莫兰迪：独白"><div class="title">乔治·莫兰迪：独白</div><div class="wt">2026-06-17</div></a>`;
  const events = parseMapExhibitions(html, {
    name: "浦东美术馆",
    url: "https://www.museumofartpd.org.cn/exhibition",
    category: "展览",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "乔治·莫兰迪：独白");
});

test("china art museum parser reads current exhibition blocks", () => {
  const html = `>君子不器——沈鹏书法艺术回顾展< 展期：2026年04月26日-2026年07月19日`;
  const events = parseChinaArtMuseumExhibitions(html, {
    name: "中华艺术宫",
    url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
    category: "展览",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "君子不器——沈鹏书法艺术回顾展");
});

test("news-like titles are still rejected after parser output", () => {
  assert.equal(isEventLikeTitle("上海市发展和改革委员会关于车用汽、柴油价格的通知"), false);
});

test("gdg shanghai parser reads embedded payload and dedupes duplicated objects", () => {
  const eventObject = `{"allows_cohosting":false,"cropped_banner_url":"https://images.example.com/banner.jpg","description":"\\u003cp\\u003eDemo Day\\u003c/p\\u003e","event_type_title":"Paid registration","is_conference":false,"start_date":"2026-10-17T01:30:00Z","title":"GDG Shanghai \\u0026 TRIPOTHON S1 Demo Day","url":"https://gdg.community.dev/events/details/google-gdg-shanghai-presents-tripothon-s1-demo-day/"}`;
  const html = `<script>const data = [${eventObject},${eventObject}];</script>`;

  const events = parseGdgShanghai(html, {
    name: "GDG 上海",
    url: "https://gdg.community.dev/gdg-shanghai/",
    category: "AI聚会",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "GDG Shanghai & TRIPOTHON S1 Demo Day");
  assert.equal(events[0].start_time, "2026-10-17T01:30:00.000Z");
  assert.equal(events[0].venue, "上海");
  assert.equal(events[0].image_url, "https://images.example.com/banner.jpg");
});

test("sii calendar parser reads lecture time and venue from ssr list", () => {
  const html = `<ul class="news_list"><li class="news"><a href="/2026/0918/c12a1230/page.htm" class="news_box"><div class='news_top'><div class='news_meta' time="2026-09-20"><span class='news_days'> </span><span class='news_year'></span></div><div class='news_type'>特邀学术报告</div></div><div class='news_wz'><div class='news_title'>机器能拥有意识吗？人工智能的“最后一公里”</div><div class='news_info'><p class="zjr">主讲人：<span>汪军</span></p><p>讲座时间：9月20日（周日）10:30-12:00</p><p>讲座地点：上海创智学院107学术报告厅</p></div></div></a></li></ul>`;

  const events = parseSiiCalendar(html, {
    name: "上海创智学院·创智日历",
    url: "https://www.sii.edu.cn/czrl/list.htm",
    category: "高校讲座",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "机器能拥有意识吗？人工智能的“最后一公里”");
  // normalizeDateTime 会把带时区的 ISO 时间统一为 UTC ISO 串（同一时刻）
  assert.equal(events[0].start_time, "2026-09-20T02:30:00.000Z");
  assert.equal(events[0].venue, "上海创智学院107学术报告厅");
  assert.equal(events[0].signup_url, "https://www.sii.edu.cn/2026/0918/c12a1230/page.htm");
});

test("shlab parser prefers title date over detail fetch", async () => {
  const html = `<a href="/event/detail/106"><div class="item"><div class="imgbox"><img class="u-img" v-ratio-resize="0.68" src="https://img.shlab.org.cn/pjlab/slides/2026/09/cover.jpg"> </div><div class="txtbox"><h2>上海AI实验室联合上海交大，叩问科学智能、共探范式跃迁 | 活动预告（10月7日）</h2> </div></div></a>`;

  let fetchCalls = 0;
  const events = await parseShlabEvents(
    html,
    { name: "上海人工智能实验室·科研活动", url: "https://www.shlab.org.cn/event", category: "AI聚会" },
    { fetchHtml: async () => { fetchCalls += 1; return ""; } },
  );

  assert.equal(fetchCalls, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].start_time, "2026-10-07T10:00:00+08:00");
  assert.equal(events[0].image_url, "https://img.shlab.org.cn/pjlab/slides/2026/09/cover.jpg");
});

test("shlab parser reads explicit year from detail and skips deadline dates", async () => {
  const html = `<a href="/event/detail/100"><div class="item"><div class="imgbox"><img class="u-img" src="https://img.shlab.org.cn/pjlab/slides/2026/02/cover.jpg"> </div><div class="txtbox"><h2>第三届沪港AI学术交流会将在上海浦东新区举办，开放报名</h2> </div></div></a><a href="/event/detail/105"><div class="item"><div class="imgbox"><img class="u-img" src="https://img.shlab.org.cn/pjlab/slides/2026/09/cover2.jpg"> </div><div class="txtbox"><h2>『书生·端砚』托举原始创新，上海AI实验室推动科研生态</h2> </div></div></a>`;
  const details = {
    "https://www.shlab.org.cn/event/detail/100": `<div>活动详情 2026年3月1日至2日，第三届沪港AI学术交流会将在上海浦东新区举办。</div>`,
    "https://www.shlab.org.cn/event/detail/105": `<div>活动详情 公益培训采用线上模式开放参与报名截止时间：2026年9月13日24:00。</div>`,
  };

  const events = await parseShlabEvents(
    html,
    { name: "上海人工智能实验室·科研活动", url: "https://www.shlab.org.cn/event", category: "AI聚会" },
    { fetchHtml: async (url) => details[url] },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "第三届沪港AI学术交流会将在上海浦东新区举办，开放报名");
  assert.equal(events[0].start_time, "2026-03-01T10:00:00+08:00");
});

test("cn cms lectures parser reads inline time/venue template", async () => {
  const html = `<li class="news"><a href="/2026/0903/c1045a70018/page.htm" target="_blank" title="超构表面光场调控:从界面相位到平面光学"><div class="news_wz"><div class="news_con"><div class="news_date"><span>2026-09-03</span></div><div class="news_title">超构表面光场调控</div><div class="news_info"><div class="news_time">时间：2026年9月9日(周三)15:00</div><div class="news_address">地点：先进制造大楼103室</div></div></div></div></a></li>`;

  let fetchCalls = 0;
  const events = await parseCnCmsLectures(
    html,
    { name: "上海理工大学·讲座日志", url: "https://www.usst.edu.cn/jzrz2_1045/list.htm", category: "高校讲座", venueLabel: "上海理工大学", defaultVenue: "上海理工大学" },
    { fetchHtml: async () => { fetchCalls += 1; return ""; } },
  );

  assert.equal(fetchCalls, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].start_time, "2026-09-09T07:00:00.000Z");
  assert.equal(events[0].venue, "上海理工大学·先进制造大楼103室");
});

test("cn cms lectures parser enriches lecture date from detail page", async () => {
  const html = `<li class="news n1 clearfix"><span class="news_title"><a href='/2026/0611/c13519a226678/page.htm' target='_blank' title='【前沿讲堂第十二讲】吴心伯：中美关系走向'>【前沿讲堂】吴心伯</a></span><span class="news_meta">2026-06-11</span></li>`;
  const detail = `<div>主讲人：吴心伯 时 间： 2026 年 6 月 17 日（周三） 14:30-16:00 地 点： 华东政法大学长宁校区 24 号楼 203 会议室 主 办：涉外法治研究院</div>`;

  const events = await parseCnCmsLectures(
    html,
    { name: "华东政法大学·讲座", url: "https://www.ecupl.edu.cn/jz/list.htm", category: "高校讲座", venueLabel: "华东政法大学", defaultVenue: "华东政法大学" },
    { fetchHtml: async () => detail },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].start_time, "2026-06-17T06:30:00.000Z");
  assert.equal(events[0].venue, "华东政法大学长宁校区 24 号楼 203 会议室");
});

test("shlib activity parser reads nuxt ssr items", () => {
  const html = `<div class="activity-list-item" data-v-1><div class="activity-list-item-img" style="background-image:url(https://reg.library.sh.cn/uploads/a.jpg);" data-v-1><div class="activity-list-item-label" data-v-1>东馆</div></div><div class="activity-list-item-content" data-v-1><div class="activity-list-item-title" data-v-1>【讲座】电影放映 | 《飞驰人生3》<div class="activity-list-item-tag" data-v-1><div class="activity-tag" data-v-1>即将开始</div></div></div><div class="activity-list-item-address" data-v-1>上海图书馆东馆1F阅剧场</div><div class="activity-list-item-date" data-v-1>2026年10月01日14:00 - 16:00</div></div></div>`;

  const events = parseShlibActivity(html, { name: "上海图书馆·讲座", url: "https://www.library.sh.cn/activity?tabName=%E8%AE%B2%E5%BA%A7", category: "线下活动" });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "【讲座】电影放映 | 《飞驰人生3》");
  assert.equal(events[0].start_time, "2026-10-01T06:00:00.000Z");
  assert.equal(events[0].venue, "上海图书馆东馆1F阅剧场");
  assert.equal(events[0].image_url, "https://reg.library.sh.cn/uploads/a.jpg");
});

test("jiading library parser falls back to publish date when detail lacks time", async () => {
  const html = `<ul class="newsList"><li class="first"><em class="number">1、</em><span class="date">2026-09-28</span><a href="/jdlib/hd/jtjz/content_978652" target="_blank" title="标题：给声音施点魔法 点击数：0">给声音施点魔法，让故事“声”临其境</a></li></ul>`;

  const events = await parseJiadingLibraryLectures(
    html,
    { name: "嘉定区图书馆·嘉图讲座", url: "http://wenlv.jiading.cn/jdlib/hd/jtjz", category: "线下活动" },
    { fetchHtml: async () => `<div>活动详情 嘉定区图书馆一楼多功能厅（裕民南路1288号） 2026年10月04日 14:00</div>` },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].start_time, "2026-10-04T06:00:00.000Z");
  assert.equal(events[0].venue, "嘉定区图书馆一楼多功能厅");
});

test("powerlong museum parser reads exhibition period and hall", () => {
  const html = `<div class="col-sm-4 iImg"><a href="https://www.powerlongmuseum.com/exhibition_detail/140.html"><img src="https://www.powerlongmuseum.com/a.jpg" /></a></div><div class="col-sm-8 iText"><div class="iTt"><h2><a href="https://www.powerlongmuseum.com/exhibition_detail/140.html">快乐公式·史莱姆感官漫游记</a></h2><div class="iTtt">沉浸式史莱姆</div></div><div class="iTb"><a href="https://www.powerlongmuseum.com/exhibition_detail/140.html"><b>2026.10.01 ~ 2027.04.05</b>上海宝龙美术馆9号厅</a></div></div>`;

  const events = parsePowerlongMuseum(html, { name: "宝龙美术馆·正在热展", url: "https://www.powerlongmuseum.com/exhibition_now.html", category: "展览" });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "快乐公式·史莱姆感官漫游记");
  assert.equal(events[0].start_time, "2026-10-01T10:00:00+08:00");
  assert.equal(events[0].end_time, "2027-04-05T10:00:00+08:00");
  assert.equal(events[0].venue, "上海宝龙美术馆9号厅");
  assert.equal(events[0].image_url, "https://www.powerlongmuseum.com/a.jpg");
});

test("iic shanghai parser reads english date range from cards", () => {
  const html = `<div class="card-wrapper"><a href="https://iicshanghai.esteri.it/zh/gli_eventi/calendario/mostra-morandi/" title="阅读文章: 展览“乔治·莫兰迪：独白”"><figure><img src="a.jpg"></figure></a><div class="card-body">进行中 Wed Jun 17 2026 Sat Oct 31 2026 展览“乔治·莫兰迪：独白”</div></div>`;

  const events = parseIicShanghai(html, { name: "意大利文化处·活动日历", url: "https://iicshanghai.esteri.it/zh/gli_eventi/calendario/", category: "展览" });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "展览“乔治·莫兰迪：独白”");
  assert.equal(events[0].start_time, "2026-06-17T10:00:00+08:00");
  assert.equal(events[0].end_time, "2026-10-31T10:00:00+08:00");
});

test("shcstheatre parser reads bilingual labels", () => {
  const html = `
    <div id="datarow"><div class='col-md-12 pad-top scape-top-bottom col12-no-paddiing'>
      <div class='program-name'><h2><a href='ProgramDetails.aspx?headtype=YanChu&ARTICLE_ID=41885&id=41885'>音乐剧《大状王》</a></h2></div>
      <ul class='program-intro'>
        <li class='size16'>地点 Venue：上海文化广场&nbsp; 主剧场</li>
        <li class='size16'>日期 Date：2026.8.14-2026.8.30</li>
        <li class='size16'>时间 Time：14:00,19:30</li>
      </ul>
    </div></div>
    <div class="load-more"></div>`;
  const events = parseShcstheatre(html, {
    name: "上海文化广场",
    url: "https://www.shcstheatre.com/Program/ProgramList.aspx",
    category: "演出音乐",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "音乐剧《大状王》");
  assert.equal(events[0].start_time, "2026-08-14T06:00:00.000Z");
  assert.equal(events[0].venue, "上海文化广场 主剧场");
});

test("huodongxing parser reads eventlist item blocks", async () => {
  const html = `
    <div class="search-tab-content-item flex">
      <a href="/event/2873278205712?utm_source=x&amp;utm_campaign=eventspage" target="_blank">
        <img class="item-logo" src="https://cdn.huodongxing.com/logo/202608/2873278205712/x.jpg" alt="上海AI开发者线下聚会" />
      </a>
      <div class="search-tab-content-item-right">
        <div class="flex item-title-wrap">
          <a class="item-title" href="/event/2873278205712?utm_source=x&amp;utm_campaign=eventspage" target="_blank">上海AI开发者线下聚会</a>
        </div>
        <p class="item-data flex"><span class="item-data-icon icon"></span>2026.09.26-2026.09.26</p>
        <p class="item-dress flex"><span class="item-dress-icon icon"></span>上海浦东柏悦酒店</p>
      </div>
    </div>`;
  const events = await parseHuodongxing(html, {
    name: "活动行上海",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7&orderby=hot",
    category: "线下活动",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "上海AI开发者线下聚会");
  assert.equal(events[0].venue, "上海浦东柏悦酒店");
  assert.equal(events[0].start_time, "2026-09-26T02:00:00.000Z");
  assert.equal(events[0].signup_url, "https://www.huodongxing.com/event/2873278205712?utm_source=x&utm_campaign=eventspage");
  assert.equal(events[0].image_url, "https://cdn.huodongxing.com/logo/202608/2873278205712/x.jpg");
});

test("bendibao date parser handles month-day ranges", () => {
  const range = parseBendibaoDateRange("7月11日—7月26日", { publishTime: "2026-07-02 09:48" });
  assert.ok(range?.start_time);
  assert.ok(range?.end_time);
});

test("bendibao article parser extracts headline event", () => {
  const events = extractEventsFromBendibaoArticle(fixture("bendibao-article.html"), {
    source: {
      name: "上海本地宝·活动",
      url: "https://sh.bendibao.com/xiuxian/",
      category: "线下活动",
    },
    url: "http://sh.bendibao.com/xiuxian/202672/307253.shtm",
  });

  assert.equal(events.length, 1);
  assert.match(events[0].title, /大宁公园/);
  assert.equal(events[0].venue, "大宁公园");
});

test("bendibao list parser fetches article detail pages", async () => {
  const events = await parseBendibaoShanghai(
    fixture("bendibao-list.html"),
    {
      name: "上海本地宝·活动",
      url: "https://sh.bendibao.com/xiuxian/",
      category: "线下活动",
    },
    { fetchHtml: async (url) => (url.includes("307253") ? fixture("bendibao-article.html") : "") },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].source_name, "上海本地宝·活动");
});

test("isRelevantPerformance filters sports titles and non-Shanghai venues", () => {
  assert.equal(isRelevantPerformance({ title: "2026广州黄埔国际网球公开赛ATP100", venue: "广州开发区国际网球学校" }), false);
  assert.equal(isRelevantPerformance({ title: "2026国际篮联洲际杯赛事", venue: "国家体育馆" }), false);
  assert.equal(isRelevantPerformance({ title: "2026小米CTCC汽车联赛上海嘉定站", venue: "上海国际赛车场" }), false);
  assert.equal(isRelevantPerformance({ title: "2026上海8小时耐力赛", venue: "上海国际赛车场" }), false);
  assert.equal(isRelevantPerformance({ title: "2026上海马拉松", venue: "上海体育场" }), false);
  assert.equal(isRelevantPerformance({ title: "某演唱会", venue: "深圳湾体育中心" }), false);
  assert.equal(isRelevantPerformance({ title: "某演出", venue: "成都城市音乐厅" }), false);

  // 英文体育标题（AllEvents / SmartShanghai 等英文源的原始标题）
  assert.equal(isRelevantPerformance({ title: "Fast & Furious Swim Championships", venue: "Shanghai Oriental Sports Center" }), false);
  assert.equal(isRelevantPerformance({ title: "Shanghai Tennis Open 2026", venue: "Qizhong Forest Sports City Arena" }), false);
  assert.equal(isRelevantPerformance({ title: "City Basketball Tournament", venue: "Shanghai Stadium" }), false);
  assert.equal(isRelevantPerformance({ title: "Intercontinental Cup Gymnastics", venue: "Shanghai" }), false);
  // 新增中文体育关键词
  assert.equal(isRelevantPerformance({ title: "2026比利简金杯深圳总决赛上海站", venue: "上海" }), false);
  assert.equal(isRelevantPerformance({ title: "全国游泳锦标赛上海站", venue: "上海东方体育中心" }), false);
  // 英文非上海城市
  assert.equal(isRelevantPerformance({ title: "Music Festival", venue: "Beijing National Stadium" }), false);

  assert.equal(isRelevantPerformance({ title: "李荣浩黑马世界巡回演唱会", venue: "上海体育场" }), true);
  assert.equal(isRelevantPerformance({ title: "音乐剧《狂炎奏鸣曲》共舞台热演", venue: "上海共舞台" }), true);
  assert.equal(isRelevantPerformance({ title: "潘玮柏MADLOVEULTRA巡回演唱会", venue: "上海虹口足球场" }), true);
  assert.equal(isRelevantPerformance({ title: "沉浸式剧场《9号秘事》", venue: "上海大剧院" }), true);
  assert.equal(isRelevantPerformance({ title: "林肯爵士乐Shenel Johns四重奏演出", venue: "林肯爵士乐上海中心" }), true);
  assert.equal(isRelevantPerformance({ title: "CHIIKAWA DAYS Exhibition", venue: "Shanghai" }), true);
});
