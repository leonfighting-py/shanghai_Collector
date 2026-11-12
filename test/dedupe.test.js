import test from "node:test";
import assert from "node:assert/strict";

import { dedupeEvents } from "../src/lib/dedupe.js";

test("rule dedupe merges same-day similar-title events before publish", async () => {
  const result = await dedupeEvents([
    {
      title: "上海春浪音乐节 2026",
      start_time: "2026-05-23T18:00:00+08:00",
      venue: "上海世博文化公园",
      category: "演出音乐",
      signup_url: "https://a.example",
      source_name: "A",
      source_url: "https://a.example",
    },
    {
      title: "2026 上海春浪音乐节",
      start_time: "2026-05-23T20:00:00+08:00",
      venue: "世博文化公园",
      category: "演出音乐",
      signup_url: "https://b.example",
      source_name: "B",
      source_url: "https://b.example",
    },
  ]);

  assert.equal(result.provider, "rules");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].sources.length, 2);
});

test("rule dedupe merges duplicate exhibition rows from different sources", async () => {
  const result = await dedupeEvents([
    {
      title: "让·努维尔：若无艺术家，建筑亦无存",
      start_time: "2026-06-27T10:00:00+08:00",
      venue: "浦东美术馆",
      category: "展览",
      signup_url: "https://www.museumofartpd.org.cn/exhibition/a",
      source_name: "浦东美术馆",
      source_url: "https://www.museumofartpd.org.cn/exhibition/a",
      summary: "浦东美术馆展出让·努维尔建筑作品，2026年6月27日开展。",
    },
    {
      title: "让·努维尔：若无艺术家，建筑亦无存",
      start_time: "2026-06-27T10:00:00+08:00",
      venue: "浦东美术馆",
      category: "展览",
      signup_url: "https://www.museumofartpd.org.cn/exhibition/b",
      source_name: "浦东美术馆",
      source_url: "https://www.museumofartpd.org.cn/exhibition/b",
    },
  ]);

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].summary, "浦东美术馆展出让·努维尔建筑作品，2026年6月27日开展。");
});

test("rule dedupe merges same-link paraphrased-title variants even across distant dates", async () => {
  // NYU 实例：同一条 event_id 链接，LLM 抽出多个改写标题并散落在不同日期，旧规则因日期差>1天漏并
  const result = await dedupeEvents([
    {
      title: "纽约大学上海秋季讲座",
      start_time: "2026-09-01T18:00:00+08:00",
      venue: "NYU Shanghai New Bund Campus",
      category: "高校讲座",
      signup_url: "https://events.shanghai.nyu.edu/#!view/event/event_id/6562",
      source_name: "NYU",
      source_url: "https://events.shanghai.nyu.edu/#!view/event/event_id/6562",
    },
    {
      title: "纽约大学上海秋季讲座活动",
      start_time: "2026-09-15T18:00:00+08:00",
      venue: "NYU Shanghai New Bund Campus",
      category: "高校讲座",
      signup_url: "https://events.shanghai.nyu.edu/#!view/event/event_id/6562",
      source_name: "NYU",
      source_url: "https://events.shanghai.nyu.edu/#!view/event/event_id/6562",
    },
  ]);

  assert.equal(result.events.length, 1);
});

test("rule dedupe keeps distinct exhibitions that merely share a generic listing url", async () => {
  // 中华艺术宫实例：解析器把多个展览都挂到同一个"当前展览"目录页链接上，标题完全不相交，必须保留
  const result = await dedupeEvents([
    {
      title: "同行：上海与巴黎抽象艺术展",
      start_time: "2026-07-30T10:00:00+08:00",
      venue: "中华艺术宫",
      category: "展览",
      signup_url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
      source_name: "中华艺术宫",
      source_url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
    },
    {
      title: "突破无人之境——方增先回顾展",
      start_time: "2026-07-31T10:00:00+08:00",
      venue: "中华艺术宫",
      category: "展览",
      signup_url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
      source_name: "中华艺术宫",
      source_url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
    },
  ]);

  assert.equal(result.events.length, 2);
});

// ---- 长期档期（票务站按"场次日"拆行）的合并 ----

function longRunRow(title, start, end, venue = "ERA-时空之旅2") {
  return {
    title,
    start_time: `${start}T19:30:00+08:00`,
    end_time: `${end}T21:00:00+08:00`,
    venue,
    category: "演出音乐",
    signup_url: `https://www.gewara.com/drama/${title.length}${start}`,
    source_name: "格瓦拉",
    source_url: `https://www.gewara.com/drama/${title.length}${start}`,
  };
}

test("rule dedupe collapses per-performance-date rows of one long run", async () => {
  // 实测形态：同一档驻场演出被票务站按场次日逐条列出，end_time 全是整档结束日
  const result = await dedupeEvents([
    longRunRow("杂技秀《ERA时空之旅2》", "2026-08-27", "2026-11-22"),
    longRunRow("演出《ERA时空之旅2》", "2026-08-29", "2026-11-22"),
    longRunRow("ERA时空之旅2", "2026-09-01", "2026-11-22"),
  ]);

  assert.equal(result.events.length, 1, "同一档长演出的多个场次应合并为一行");
});

test("rule dedupe collapses long-run rows whose titles differ only by a suffix", async () => {
  const result = await dedupeEvents([
    longRunRow("环境式原创音乐剧《梅尔泉》", "2026-08-07", "2026-10-06", "星空间"),
    longRunRow("环境式原创音乐剧《梅尔泉 Mute Spring》", "2026-08-09", "2026-10-06", "星空间"),
  ]);

  assert.equal(result.events.length, 1);
});

test("rule dedupe keeps long-run events whose date ranges barely overlap", async () => {
  // 同一场馆、标题相同，但两段档期基本不重叠 —— 是两轮不同档期的演出，必须保留
  const result = await dedupeEvents([
    longRunRow("杂技秀《ERA时空之旅2》", "2026-03-01", "2026-04-20"),
    longRunRow("杂技秀《ERA时空之旅2》", "2026-08-27", "2026-11-22"),
  ]);

  assert.equal(result.events.length, 2);
});

test("rule dedupe keeps long-run events with clearly different titles", async () => {
  const result = await dedupeEvents([
    longRunRow("印象派大师真迹大展", "2026-08-01", "2026-11-30", "上海博物馆"),
    longRunRow("古埃及文明大展", "2026-08-05", "2026-11-30", "上海博物馆"),
  ]);

  assert.equal(result.events.length, 2);
});

test("rule dedupe does NOT merge single-day events on different dates", async () => {
  // 无 end_time 的单场活动不参与长档期合并，日期不同就是不同场次
  const result = await dedupeEvents([
    {
      title: "维也纳之声金秋交响音乐会",
      start_time: "2026-10-05T19:30:00+08:00",
      venue: "上海东方艺术中心",
      category: "演出音乐",
      signup_url: "https://a.example/1",
      source_name: "A",
      source_url: "https://a.example/1",
    },
    {
      title: "维也纳之声金秋交响音乐会",
      start_time: "2026-10-12T19:30:00+08:00",
      venue: "上海东方艺术中心",
      category: "演出音乐",
      signup_url: "https://a.example/2",
      source_name: "A",
      source_url: "https://a.example/2",
    },
  ]);

  assert.equal(result.events.length, 2);
});
