import test from "node:test";
import assert from "node:assert/strict";

import { collectEventsFromSources, SOURCE_SEEDS, classifyFailure } from "../src/lib/collector.js";
import { SAMPLE_EVENTS } from "../src/lib/sample-events.js";

test("source seeds cover each required category with enough recall depth", () => {
  const counts = SOURCE_SEEDS.reduce((memo, source) => {
    memo[source.category] = (memo[source.category] ?? 0) + 1;
    return memo;
  }, {});

  assert.ok(counts["演出音乐"] >= 7);
  assert.ok(counts["展览"] >= 8);
  assert.ok(counts["线下活动"] >= 6);
  assert.ok(counts["高校讲座"] >= 4);
  // AI聚会 4 个源（原第 5 个 OpenClaw 与 Lu.ma Shanghai 同 URL，纯重复已删，2026-08）
  assert.ok(counts["AI聚会"] >= 4);
});

test("source seeds include a strong Chinese primary layer", () => {
  const chineseSources = SOURCE_SEEDS.filter((source) => source.locale === "zh");

  assert.ok(chineseSources.length >= 14);
  assert.ok(chineseSources.some((source) => source.name.includes("中华艺术宫")));
  assert.ok(chineseSources.some((source) => source.name.includes("互动吧")));
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

test("collector runs sources with bounded concurrency and still isolates failures", async () => {
  let running = 0;
  let maxRunning = 0;
  const makeSource = (name) => ({
    name,
    url: `https://example.test/${name}`,
    category: "线下活动",
    parser: async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 30));
      running -= 1;
      return [];
    },
  });

  const result = await collectEventsFromSources({
    sources: ["a", "b", "c", "d", "e", "f"].map(makeSource),
    fetchHtml: async () => "<html></html>",
    now: "2026-05-22T08:00:00+08:00",
    concurrency: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.ok(maxRunning <= 3, `并发度不应超过 3，实际峰值 ${maxRunning}`);
  assert.ok(maxRunning >= 2, `应观察到并发执行，峰值仅 ${maxRunning}`);
});

test("collector tags failures with structured kind", async () => {
  const result = await collectEventsFromSources({
    sources: [
      {
        name: "Timeout",
        url: "https://example.test/timeout",
        category: "展览",
        parser: () => {
          const error = new Error("Timeout timed out after 45s");
          throw error;
        },
        timeoutMs: 50,
      },
      {
        name: "NotFound",
        url: "https://example.test/missing",
        category: "展览",
        parser: () => {
          throw new Error("HTTP 404");
        },
      },
    ],
    fetchHtml: async () => "<html></html>",
    now: "2026-05-22T08:00:00+08:00",
  });

  assert.equal(result.failures.length, 2);
  const byName = Object.fromEntries(result.failures.map((f) => [f.source, f]));
  assert.equal(byName.Timeout.kind, "timeout");
  assert.equal(byName.NotFound.kind, "http_4xx");
});

test("classifyFailure buckets error messages reliably", () => {
  const cases = [
    ["Connection timed out after 45s", "timeout"],
    ["timed out", "timeout"],
    ["超时", "timeout"],
    ["HTTP 429", "rate_limited"],
    ["HTTP 403", "http_4xx"],
    ["HTTP 404 Not Found", "http_4xx"],
    ["HTTP 502 Bad Gateway", "http_5xx"],
    ["fetch failed", "network"],
    ["getaddrinfo ENOTFOUND example.com", "network"],
    ["Unexpected token < in JSON", "parse"],
    ["无法解析页面", "parse"],
    ["some weird error", "unknown"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(classifyFailure(message), expected, `classifyFailure(${JSON.stringify(message)})`);
  }
});
