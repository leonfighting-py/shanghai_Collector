import test from "node:test";
import assert from "node:assert/strict";

import {
  createChatCompletion,
  getLlmBudgetConfig,
  getLlmBudgetUsage,
  resetLlmBudget,
} from "../src/lib/siliconflow.js";

const enabledConfig = {
  enabled: true,
  apiKey: "test-key",
  baseUrl: "https://example.test",
  model: "test-model",
  timeoutMs: 5_000,
  enableThinking: false,
};

function mockFetch() {
  const calls = [];
  const fetchImpl = async () => {
    calls.push(true);
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "{\"items\":[]}" } }],
        usage: { total_tokens: 10 },
      }),
    };
  };
  return { fetchImpl, calls };
}

test("getLlmBudgetConfig defaults to enabled with 1000 calls", () => {
  const config = getLlmBudgetConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.maxCalls, 1000);
});

test("getLlmBudgetConfig honors env overrides", () => {
  assert.equal(getLlmBudgetConfig({ LLM_BUDGET_ENABLED: "false" }).enabled, false);
  assert.equal(getLlmBudgetConfig({ LLM_BUDGET_MAX_CALLS: "5" }).maxCalls, 5);
  // 非法/非正值回退到默认
  assert.equal(getLlmBudgetConfig({ LLM_BUDGET_MAX_CALLS: "0" }).maxCalls, 1000);
  assert.equal(getLlmBudgetConfig({ LLM_BUDGET_MAX_CALLS: "abc" }).maxCalls, 1000);
});

test("resetLlmBudget zeroes usage and applies env cap", () => {
  const usage = resetLlmBudget({ LLM_BUDGET_MAX_CALLS: "3" });
  assert.equal(usage.used, 0);
  assert.equal(usage.cap, 3);
  assert.deepEqual(getLlmBudgetUsage(), { used: 0, cap: 3, enabled: true });
});

test("createChatCompletion counts each call toward the budget", async () => {
  resetLlmBudget({ LLM_BUDGET_MAX_CALLS: "2" });
  const { fetchImpl, calls } = mockFetch();
  await createChatCompletion({ messages: [] }, { config: enabledConfig, fetchImpl });
  await createChatCompletion({ messages: [] }, { config: enabledConfig, fetchImpl });
  assert.equal(getLlmBudgetUsage().used, 2);
  assert.equal(calls.length, 2);
});

test("createChatCompletion throws LLM_BUDGET_EXCEEDED once cap is hit", async () => {
  resetLlmBudget({ LLM_BUDGET_MAX_CALLS: "1" });
  const { fetchImpl, calls } = mockFetch();
  await createChatCompletion({ messages: [] }, { config: enabledConfig, fetchImpl });
  await assert.rejects(
    () => createChatCompletion({ messages: [] }, { config: enabledConfig, fetchImpl }),
    (error) => {
      assert.equal(error.code, "LLM_BUDGET_EXCEEDED");
      assert.match(error.message, /已用 1 \/ 上限 1/);
      return true;
    },
  );
  assert.equal(calls.length, 1, "超阈值后不应再发 fetch");
  assert.equal(getLlmBudgetUsage().used, 1);
});

test("disabled budget does not count or trip", async () => {
  resetLlmBudget({ LLM_BUDGET_ENABLED: "false" });
  const { fetchImpl, calls } = mockFetch();
  await createChatCompletion({ messages: [] }, { config: enabledConfig, fetchImpl });
  await createChatCompletion({ messages: [] }, { config: enabledConfig, fetchImpl });
  assert.equal(calls.length, 2);
});
