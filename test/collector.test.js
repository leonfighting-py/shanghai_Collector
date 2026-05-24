import test from "node:test";
import assert from "node:assert/strict";

import { collectEventsFromSources, SOURCE_SEEDS } from "../src/lib/collector.js";
import { SAMPLE_EVENTS } from "../src/lib/sample-events.js";

test("source seeds cover each required category with enough recall depth", () => {
  const counts = SOURCE_SEEDS.reduce((memo, source) => {
    memo[source.category] = (memo[source.category] ?? 0) + 1;
    return memo;
  }, {});

  assert.ok(counts["演出音乐"] >= 4);
  assert.ok(counts["展览"] >= 4);
  assert.ok(counts["线下活动"] >= 4);
  assert.ok(counts["高校讲座"] >= 4);
  assert.ok(counts["AI聚会"] >= 3);
});

test("local sample data is rich enough for the current-week page", () => {
  const counts = SAMPLE_EVENTS.reduce((memo, event) => {
    memo[event.category] = (memo[event.category] ?? 0) + 1;
    return memo;
  }, {});

  assert.ok(SAMPLE_EVENTS.length >= 16);
  assert.ok(counts["演出音乐"] >= 4);
  assert.ok(counts["展览"] >= 4);
  assert.ok(counts["线下活动"] >= 4);
  assert.ok(counts["高校讲座"] >= 4);
  assert.ok(counts["AI聚会"] >= 3);
});

test("collector keeps last published data when every source fails", async () => {
  const previous = [
    {
      title: "已发布活动",
      start_time: "2026-05-22T19:00:00+08:00",
      venue: "上海",
      category: "线下活动",
      signup_url: "https://example.com/old",
      source_name: "Previous",
      source_url: "https://example.com/old",
      dedupe_key: "old",
      sources: [{ name: "Previous", url: "https://example.com/old" }],
    },
  ];

  const result = await collectEventsFromSources({
    sources: [
      {
        name: "Broken",
        url: "https://example.com/broken",
        category: "展览",
        parser: () => {
          throw new Error("boom");
        },
      },
    ],
    previousEvents: previous,
    fetchHtml: async () => "<html></html>",
    now: "2026-05-22T08:00:00+08:00",
  });

  assert.equal(result.events, previous);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
});
