import test from "node:test";
import assert from "node:assert/strict";

import { dedupeEvents, shouldUseLlmDedupe } from "../src/lib/dedupe.js";

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

test("LLM dedupe is opt-in and needs API credentials", () => {
  assert.equal(shouldUseLlmDedupe({ LLM_DEDUPE_ENABLED: "false", OPENAI_API_KEY: "x" }), false);
  assert.equal(shouldUseLlmDedupe({ LLM_DEDUPE_ENABLED: "true" }), false);
  assert.equal(shouldUseLlmDedupe({ LLM_DEDUPE_ENABLED: "true", OPENAI_API_KEY: "x" }), true);
});
