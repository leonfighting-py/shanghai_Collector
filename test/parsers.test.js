import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseBendibaoShanghai, extractEventsFromBendibaoArticle, parseBendibaoDateRange } from "../src/lib/parsers/bendibao.js";
import { parseDoubanShanghai } from "../src/lib/parsers/douban.js";
import { parseEventbriteAiTech } from "../src/lib/parsers/eventbrite.js";
import { parseJsonLdEvents } from "../src/lib/parsers/json-ld.js";
import { parseMaoyan } from "../src/lib/parsers/maoyan.js";
import { parseSmartShanghai } from "../src/lib/parsers/smartshanghai.js";
import { isEventLikeTitle } from "../src/lib/events.js";
import { buildEvent, parseFlexibleDate } from "../src/lib/parsers/shared.js";
import { parseChinaArtMuseumExhibitions } from "../src/lib/parsers/artmuseumonline.js";
import { parseMapExhibitions } from "../src/lib/parsers/map.js";

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
