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
  normalizeEventCategory,
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

test("ongoing exhibitions stay in range only while their end_time has not passed", () => {
  const startDate = "2026-06-19";
  const endDate = "2026-07-02";

  // 开口在窗口之前、但尚未结束 → 仍在窗口内
  assert.equal(
    isInDateRange(
      { title: "常设展", category: "展览", start_time: "2026-06-02T10:00:00+08:00", end_time: "2026-09-30T18:00:00+08:00" },
      startDate,
      endDate,
    ),
    true,
  );

  // 没有 end_time：按 start_time 兜底，视为当日已结束 → 不在窗口内
  assert.equal(
    isInDateRange(
      { title: "无结束时间的展", category: "展览", start_time: "2026-06-02T10:00:00+08:00", end_time: null },
      startDate,
      endDate,
    ),
    false,
  );

  // 结束时间已过 → 不在窗口内
  assert.equal(
    isInDateRange(
      { title: "已闭幕的展", category: "展览", start_time: "2026-06-02T10:00:00+08:00", end_time: "2026-06-10T18:00:00+08:00" },
      startDate,
      endDate,
    ),
    false,
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

test("isEventLikeTitle rejects campus and commercial notification shapes", () => {
  // 高校教务/院系通知公告栏里混进来的条目：标题本身不像公告，旧规则全部漏过
  for (const title of [
    "复旦2027考研855考试大纲发布",
    "复旦大学中文系博士奖学金评选细则",
    "2026级本科新生基本信息维护",
    "关于启动2027年春季学期国际交流项目（第二批）的选派通知 2026-09-29",
    "上经贸大第三周学术活动预告",
  ]) {
    assert.equal(isEventLikeTitle(title), false, title);
  }

  // 商业地产资讯：只断言**高精度**形态。
  // 开放式的新闻标题（"MIXC AIR落地武汉天河T3探索机场商业"、
  // "服装圈三丽鸥主题店开业巴拉巴拉布局"）不在这里断言 —— 它们靠退休「赢商网」源解决，
  // 靠枚举正则打不完（test/collector.test.js 另有源退休的断言）。
  for (const title of [
    "2026山东四季度近30商业项目待开业",
    "苍南宝龙广场携120首进品牌重构县域",
  ]) {
    assert.equal(isEventLikeTitle(title), false, title);
  }
});

test("isEventLikeTitle still keeps real event titles that look adjacent to the new patterns", () => {
  for (const title of [
    "讲座：给声音施点魔法，让故事声临其境",
    "解锁AI提示词工程讲座",
    "上海传说之下交响音乐会",
    "沉浸式惊悚体验《开关SWITCH》上海",
    "宝格丽Kaleidos万花绮镜特展",
  ]) {
    assert.equal(isEventLikeTitle(title), true, title);
  }
});

test("normalizeEventCategory moves exhibitions wrongly filed under 演出音乐", () => {
  assert.equal(normalizeEventCategory({ category: "演出音乐", title: "CHIIKAWA DAYS特展中国内地首展" }), "展览");
  assert.equal(normalizeEventCategory({ category: "演出音乐", title: "上海《魔法少女小圆》15周年纪念特展" }), "展览");
  assert.equal(normalizeEventCategory({ category: "演出音乐", title: "约翰尼德普“边缘形象”艺术展" }), "展览");
  // 真演出不动
  assert.equal(normalizeEventCategory({ category: "演出音乐", title: "维也纳之声金秋交响音乐会" }), "演出音乐");
  assert.equal(normalizeEventCategory({ category: "演出音乐", title: "西班牙舞剧团《卡门》" }), "演出音乐");
  // 其它类目不动
  assert.equal(normalizeEventCategory({ category: "展览", title: "某某特展" }), "展览");
});

test("filterPublishableEvents corrects category and then applies long-run end_time", () => {
  const [event] = filterPublishableEvents([
    {
      title: "CHIIKAWA DAYS特展中国内地首展",
      category: "演出音乐",
      start_time: "2026-09-13T10:00:00+08:00",
      end_time: null,
      venue: "上海",
      signup_url: "https://example.com/a",
      source_name: "格瓦拉",
      source_url: "https://example.com/a",
    },
  ]);

  assert.equal(event.category, "展览");
  // 类目纠正早于结束时间推断：原本挂"演出音乐"会保持 null，纠正为展览后补 +90 天
  assert.equal(event.end_time, "2026-12-12T10:00:00+08:00");
});

// 字段补齐的多源合并（docs/plans/2026-10-12-event-facets-backfill.md 第 5 节）：
// 一方有值一方为空时取有值的；都非空时信源等级高的赢。
function facetEvent(overrides = {}) {
  return {
    title: "同一场活动的合并测试演出",
    start_time: "2026-11-20T19:30:00+08:00",
    venue: "上海交响乐团音乐厅",
    category: "演出音乐",
    signup_url: "https://a.example.com/e/1",
    source_name: "Source A",
    source_url: "https://a.example.com/e/1",
    source_tier: "T2",
    ...overrides,
  };
}

test("补齐字段：一方为空时取另一方", () => {
  const merged = mergeDuplicateEvents(
    filterPublishableEvents([
      facetEvent({ address: "", price_min: null }),
      facetEvent({
        source_name: "Source B",
        source_url: "https://b.example.com/e/1",
        signup_url: "https://b.example.com/e/1",
        address: "上海市徐汇区复兴中路1380号",
        price_min: 180,
        price_max: 680,
      }),
    ]),
  );

  assert.equal(merged[0].address, "上海市徐汇区复兴中路1380号");
  assert.equal(merged[0].price_min, 180);
  assert.equal(merged[0].price_max, 680);
});

test("补齐字段：都非空时信源等级高的赢", () => {
  const merged = mergeDuplicateEvents(
    filterPublishableEvents([
      facetEvent({ price_min: 100, price_max: 100, address: "聚合器写的地址" }),
      facetEvent({
        source_name: "场馆官网",
        source_url: "https://venue.example.com/e/1",
        signup_url: "https://venue.example.com/e/1",
        source_tier: "T1",
        price_min: 180,
        price_max: 680,
        address: "官网地址",
      }),
    ]),
  );

  assert.equal(merged[0].price_min, 180);
  assert.equal(merged[0].address, "官网地址");
});

test("补齐字段：is_free=false 是有效值，不能当空值丢掉", () => {
  const merged = mergeDuplicateEvents(
    filterPublishableEvents([
      facetEvent(),
      facetEvent({
        source_name: "Source B",
        source_url: "https://b.example.com/e/1",
        signup_url: "https://b.example.com/e/1",
        is_free: false,
      }),
    ]),
  );

  assert.equal(merged[0].is_free, false);
});

test("补齐字段：人群标签取并集", () => {
  const merged = mergeDuplicateEvents(
    filterPublishableEvents([
      facetEvent({ audience: ["亲子"] }),
      facetEvent({
        source_name: "Source B",
        source_url: "https://b.example.com/e/1",
        signup_url: "https://b.example.com/e/1",
        audience: ["学生", "亲子"],
      }),
    ]),
  );

  assert.deepEqual([...merged[0].audience].sort(), ["亲子", "学生"]);
});

test("补齐字段：来源标记合并，两边的键都留着", () => {
  const merged = mergeDuplicateEvents(
    filterPublishableEvents([
      facetEvent({ facet_provenance: { address: "regex" } }),
      facetEvent({
        source_name: "Source B",
        source_url: "https://b.example.com/e/1",
        signup_url: "https://b.example.com/e/1",
        facet_provenance: { price: "jsonld" },
      }),
    ]),
  );

  assert.equal(merged[0].facet_provenance.address, "regex");
  assert.equal(merged[0].facet_provenance.price, "jsonld");
});
