import assert from "node:assert/strict";
import test from "node:test";

import {
  filterEventCategories,
  getCategoryFilterConfig,
  isAiMeetupContent,
  ruleFilterCategory,
} from "../src/lib/category-filter.js";

test("isAiMeetupContent rejects board game and unrelated lectures", () => {
  assert.equal(
    isAiMeetupContent({
      title: "Clank! Legacy 桌游聚会",
      summary: "7月12日8点举办 Clank! Legacy 桌游活动。",
      source_name: "AI Tinkerers Shanghai",
    }),
    false,
  );
  assert.equal(
    isAiMeetupContent({
      title: "GOD THE HUMORIST 伊朗航空 655 讲座",
      summary: "探讨伊朗航空 655 及吉姆·莫里森",
      source_name: "AI Tinkerers Shanghai",
    }),
    false,
  );
});

test("isAiMeetupContent accepts explicit AI meetups", () => {
  assert.equal(
    isAiMeetupContent({
      title: "ShanghAI AI 上海最佳活动聚会",
      summary: "1984书店举办 AI 开发者交流",
      source_name: "ShanghAI AI Meetup",
    }),
    true,
  );
});

test("ruleFilterCategory reclassifies obvious non-AI events", () => {
  const decision = ruleFilterCategory({
    category: "AI聚会",
    title: "Clank! Legacy 桌游聚会",
    summary: "桌游",
    source_name: "AI Tinkerers Shanghai",
  });
  assert.equal(decision.category, "线下活动");
  assert.equal(decision.reason, "ai-negative-rule");
});

test("filterEventCategories uses mocked llm to reclassify uncertain AI events", async () => {
  const previousKey = process.env.SILICONFLOW_API_KEY;
  const previousEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  process.env.SILICONFLOW_API_KEY = "demo-key";
  process.env.LLM_ENRICHMENT_ENABLED = "true";

  const events = [
    {
      title: "ShanghAI AI 上海最佳活动聚会",
      summary: "1984书店",
      category: "AI聚会",
      source_name: "ShanghAI AI Meetup",
    },
    {
      title: "Clank! Legacy 桌游聚会",
      summary: "桌游",
      category: "AI聚会",
      source_name: "AI Tinkerers Shanghai",
    },
  ];

  const result = await filterEventCategories(events, {
    config: getCategoryFilterConfig(),
    chat: async () => ({
      content: JSON.stringify({
        items: [{ index: 0, category: "AI聚会", keep: true }],
      }),
    }),
  });

  assert.equal(result.reclassifiedCount, 1);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.events[0].category, "AI聚会");
  assert.equal(result.events[1].category, "线下活动");

  if (previousKey) process.env.SILICONFLOW_API_KEY = previousKey;
  else delete process.env.SILICONFLOW_API_KEY;
  if (previousEnabled) process.env.LLM_ENRICHMENT_ENABLED = previousEnabled;
  else delete process.env.LLM_ENRICHMENT_ENABLED;
});
