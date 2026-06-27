import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonFromModelContent, getSiliconFlowConfig } from "../src/lib/siliconflow.js";
import {
  enrichEventsForPublish,
  getEventEnrichmentConfig,
  shouldEnrichEvent,
} from "../src/lib/event-enrichment.js";

test("siliconflow config reads api key and default model", () => {
  const previous = process.env.SILICONFLOW_API_KEY;
  delete process.env.SILICONFLOW_API_KEY;
  assert.equal(getSiliconFlowConfig().enabled, false);

  process.env.SILICONFLOW_API_KEY = "demo-key";
  const config = getSiliconFlowConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.model, "Qwen/Qwen3.5-35B-A3B");
  assert.match(config.baseUrl, /siliconflow\.cn/);

  if (previous) process.env.SILICONFLOW_API_KEY = previous;
  else delete process.env.SILICONFLOW_API_KEY;
});

test("parseJsonFromModelContent supports fenced json blocks", () => {
  const parsed = parseJsonFromModelContent('```json\n{"items":[{"index":0,"title":"测试活动名称","summary":"6月21日在上海举办的一场测试活动，适合周末前往。"}]}\n```');
  assert.equal(parsed.items[0].title, "测试活动名称");
});

test("enrichment is disabled without api key", async () => {
  const previousKey = process.env.SILICONFLOW_API_KEY;
  const previousEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  delete process.env.SILICONFLOW_API_KEY;
  process.env.LLM_ENRICHMENT_ENABLED = "true";

  const event = {
    title: "原始标题示例活动信息",
    start_time: "2026-06-21T10:00:00+08:00",
    venue: "上海",
    category: "线下活动",
    signup_url: "https://example.com/a",
    source_name: "公众号·测试",
    source_url: "https://example.com/a",
  };

  assert.equal(getEventEnrichmentConfig().enabled, false);
  assert.equal(shouldEnrichEvent(event, getEventEnrichmentConfig()), false);

  const result = await enrichEventsForPublish([event]);
  assert.equal(result.enrichedCount, 0);
  assert.equal(result.events[0].title, event.title);

  if (previousKey) process.env.SILICONFLOW_API_KEY = previousKey;
  else delete process.env.SILICONFLOW_API_KEY;
  if (previousEnabled) process.env.LLM_ENRICHMENT_ENABLED = previousEnabled;
  else delete process.env.LLM_ENRICHMENT_ENABLED;
});

test("enrichment applies mocked llm titles and summaries", async () => {
  const previousKey = process.env.SILICONFLOW_API_KEY;
  const previousEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  process.env.SILICONFLOW_API_KEY = "demo-key";
  process.env.LLM_ENRICHMENT_ENABLED = "true";

  const events = [
    {
      title: "6月魔都文娱活动TOP 15 乔治・莫兰迪：独白",
      start_time: "2026-06-17T02:00:00.000Z",
      venue: "浦东美术馆（浦东新区滨江大道 2777 号）",
      category: "展览",
      signup_url: "https://example.com/1",
      source_name: "公众号·ShanghaiWOW",
      source_url: "https://example.com/1",
    },
  ];

  const result = await enrichEventsForPublish(events, {
    config: getEventEnrichmentConfig(),
    chat: async () => ({
      content: JSON.stringify({
        items: [
          {
            index: 0,
            title: "乔治·莫兰迪：独白 浦东美术馆个展",
            summary: "6月17日起在浦东美术馆展出，本世纪最大规模莫兰迪个展，逾140件原作亮相黄浦江畔。",
          },
        ],
      }),
    }),
  });

  assert.equal(result.enrichedCount, 1);
  assert.match(result.events[0].title, /莫兰迪/);
  assert.match(result.events[0].summary, /浦东美术馆/);
  assert.equal(result.events[0].original_title, events[0].title);

  if (previousKey) process.env.SILICONFLOW_API_KEY = previousKey;
  else delete process.env.SILICONFLOW_API_KEY;
  if (previousEnabled) process.env.LLM_ENRICHMENT_ENABLED = previousEnabled;
  else delete process.env.LLM_ENRICHMENT_ENABLED;
});
