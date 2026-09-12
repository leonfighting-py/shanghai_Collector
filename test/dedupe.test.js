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
