import test from "node:test";
import assert from "node:assert/strict";

import {
  CATEGORIES,
  buildDedupeKey,
  filterPublishableEvents,
  isEventLikeTitle,
  isInDateRange,
  isShanghaiRelevantEvent,
  mergeDuplicateEvents,
  safeExternalUrl,
  toShanghaiDayWindow,
  toShanghaiWeekRange,
} from "../src/lib/events.js";

test("external urls only allow http(s) schemes", () => {
  assert.equal(safeExternalUrl("https://example.com/e"), "https://example.com/e");
  assert.equal(safeExternalUrl("http://example.com/e"), "http://example.com/e");
  assert.equal(safeExternalUrl("javascript:alert(1)"), "#");
  assert.equal(safeExternalUrl("data:text/html,x"), "#");
  assert.equal(safeExternalUrl(""), "#");
  assert.equal(safeExternalUrl(null), "#");
});

test("keeps the homepage categories stable", () => {
  assert.deepEqual(CATEGORIES, ["演出音乐", "展览", "线下活动", "高校讲座", "AI聚会"]);
});

test("rejects government news and malformed parser titles", () => {
  assert.equal(isEventLikeTitle("周五爵士现场"), true);
  assert.equal(isEventLikeTitle("上海市发展和改革委员会关于车用汽、柴油价格的通知（2026年6月4日）"), false);
  assert.equal(isEventLikeTitle('","availabilityEnds":null,"validFrom":"'), false);
  assert.equal(isEventLikeTitle('T11:30:00.000Z","endDate":"'), false);
});

test("filters records missing required publishing fields", () => {
  const valid = {
    title: "周五爵士现场",
    start_time: "2026-05-22T20:00:00+08:00",
    venue: "Blue Note Shanghai",
    category: "演出音乐",
    signup_url: "https://example.com/jazz",
    source_name: "Example",
    source_url: "https://example.com",
  };

  const events = filterPublishableEvents([
    valid,
    { ...valid, title: "" },
    { ...valid, start_time: "" },
    { ...valid, signup_url: "" },
    { ...valid, category: "其他" },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].dedupe_key, buildDedupeKey(valid));
});

test("dedupe key normalizes title, event date, and venue", () => {
  const left = buildDedupeKey({
    title: "  2026 上海 春浪 音乐节！",
    start_time: "2026-05-23T18:00:00+08:00",
    venue: " 上海世博文化公园 ",
  });
  const right = buildDedupeKey({
    title: "2026上海春浪音乐节",
    start_time: "2026-05-23T20:00:00+08:00",
    venue: "上海世博文化公园",
  });

  assert.equal(left, right);
});

test("merges duplicate events and preserves multiple sources", () => {
  const events = filterPublishableEvents([
    {
      title: "上海春浪音乐节",
      start_time: "2026-05-23T18:00:00+08:00",
      venue: "上海世博文化公园",
      category: "演出音乐",
      signup_url: "https://source-a.example/event",
      source_name: "Source A",
      source_url: "https://source-a.example/event",
    },
    {
      title: " 上海春浪音乐节 ",
      start_time: "2026-05-23T19:00:00+08:00",
      venue: "上海世博文化公园",
      category: "演出音乐",
      signup_url: "https://source-b.example/event",
      source_name: "Source B",
      source_url: "https://source-b.example/event",
    },
  ]);

  const merged = mergeDuplicateEvents(events);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 2);
  assert.deepEqual(
    merged[0].sources.map((source) => source.name),
    ["Source A", "Source B"],
  );
});

test("computes a Monday to Sunday Shanghai week range", () => {
  const range = toShanghaiWeekRange("2026-05-22");

  assert.equal(range.startDate, "2026-05-18");
  assert.equal(range.endDate, "2026-05-24");
});

test("computes a rolling fourteen-day Shanghai publish window by default", () => {
  const range = toShanghaiDayWindow("2026-06-12");

  assert.equal(range.startDate, "2026-06-12");
  assert.equal(range.endDate, "2026-06-25");
  assert.equal(range.days, 14);
});

test("keeps recent ongoing exhibitions visible after their opening date", () => {
  assert.equal(
    isInDateRange(
      {
        title: "常设展",
        category: "展览",
        start_time: "2026-06-02T10:00:00+08:00",
      },
      "2026-06-19",
      "2026-07-02",
    ),
    true,
  );
});

test("isShanghaiRelevantEvent filters out non-Shanghai regions", () => {
  assert.equal(isShanghaiRelevantEvent({ venue: "济南大明湖", title: "山东非遗展" }), false);
  assert.equal(isShanghaiRelevantEvent({ venue: "北京国家体育场", title: "某演唱会" }), false);
  assert.equal(isShanghaiRelevantEvent({ venue: "深圳湾体育中心", title: "某演出" }), false);
  assert.equal(isShanghaiRelevantEvent({ venue: "广州大剧院", title: "歌剧" }), false);
});

test("isShanghaiRelevantEvent keeps Shanghai events", () => {
  assert.equal(isShanghaiRelevantEvent({ venue: "上海大剧院", title: "新年音乐会" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "浦东美术馆", title: "特展" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "陆家嘴", title: "金融论坛" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "Blue Note Shanghai", title: "Jazz Night" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "中华艺术宫", title: "常设展" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "大宁公园", title: "郁金香展" }), true);
});

test("isShanghaiRelevantEvent keeps dual-city and override-name events", () => {
  assert.equal(isShanghaiRelevantEvent({ venue: "上海博物馆", title: "上海-山东双城展" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "南京东路第一百货", title: "周末市集" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "苏州河畔艺术中心", title: "当代艺术展" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "江苏路某空间", title: "读书会" }), true);
});

test("isShanghaiRelevantEvent keeps events without any region hint", () => {
  assert.equal(isShanghaiRelevantEvent({ venue: "JZ Club", title: "爵士现场" }), true);
  assert.equal(isShanghaiRelevantEvent({ venue: "某空间", title: "某活动", summary: "地点在徐汇区" }), true);
});

test("filterPublishableEvents drops non-Shanghai events", () => {
  const base = {
    title: "周末文创市集",
    start_time: "2026-05-23T18:00:00+08:00",
    category: "线下活动",
    signup_url: "https://example.com",
    source_name: "Example",
    source_url: "https://example.com",
  };
  const events = filterPublishableEvents([
    { ...base, venue: "上海大剧院" },
    { ...base, venue: "济南大明湖", title: "山东民俗展演" },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].venue, "上海大剧院");
});
