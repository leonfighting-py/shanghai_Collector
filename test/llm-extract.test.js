import test from "node:test";
import assert from "node:assert/strict";

import { extractPageText, getLlmExtractConfig, parseWithLlmExtraction } from "../src/lib/parsers/llm-extract.js";

const SOURCE = {
  name: "测试源",
  url: "https://example.com/events",
  category: "AI聚会",
};

test("llm extract is disabled without explicit flag or api key", () => {
  assert.equal(getLlmExtractConfig({}).enabled, false);
  assert.equal(getLlmExtractConfig({ LLM_EXTRACT_ENABLED: "true" }).enabled, false);
  assert.equal(getLlmExtractConfig({ SILICONFLOW_API_KEY: "k" }).enabled, false);
  assert.equal(getLlmExtractConfig({ LLM_EXTRACT_ENABLED: "true", SILICONFLOW_API_KEY: "k" }).enabled, true);
});

test("page text extraction strips html and truncates", () => {
  const text = extractPageText("<html><body><script>var x=1;</script><p>  活动正文  </p><style>.a{}</style></body></html>");
  assert.equal(text, "活动正文");

  const long = extractPageText(`<p>${"字".repeat(20000)}</p>`);
  assert.equal(long.length, 8000);
});

test("parseWithLlmExtraction returns empty for js-shell pages without calling model", async () => {
  let called = false;
  const events = await parseWithLlmExtraction("<div id='root'></div>", SOURCE, {
    config: { enabled: true, silicon: {} },
    chat: async () => {
      called = true;
      return { content: "{}" };
    },
  });

  assert.equal(events.length, 0);
  assert.equal(called, false);
});

test("parseWithLlmExtraction maps model items to publishable events", async () => {
  const html = `<p>AI Tinkerers Shanghai Meetup，2026年9月12日周六下午2点，上海市徐汇区某空间，报名链接 /p/september-meetup。欢迎大家参加。</p>${"<p>填充文本</p>".repeat(60)}`;
  const events = await parseWithLlmExtraction(html, SOURCE, {
    config: { enabled: true, silicon: {} },
    chat: async ({ messages }) => {
      // 确认正文与来源信息进了 prompt
      assert.ok(messages[1].content.includes("AI Tinkerers Shanghai Meetup"));
      assert.ok(messages[1].content.includes("测试源"));
      return {
        content: JSON.stringify({
          items: [
            { title: "AI Tinkerers Shanghai 九月聚会", start: "2026-09-12", end: null, venue: "徐汇区某空间", url: "https://example.com/p/september-meetup" },
          ],
        }),
      };
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "AI Tinkerers Shanghai 九月聚会");
  assert.equal(events[0].venue, "徐汇区某空间");
  assert.equal(events[0].signup_url, "https://example.com/p/september-meetup");
  assert.equal(events[0].source_name, "测试源");
});

test("parseWithLlmExtraction drops items missing dates and survives model failure", async () => {
  const html = `<p>某个即将举行的活动，欢迎参加。${"文本".repeat(100)}</p>`;
  const events = await parseWithLlmExtraction(html, SOURCE, {
    config: { enabled: true, silicon: {} },
    chat: async () => {
      throw new Error("api down");
    },
  });
  assert.equal(events.length, 0);

  const events2 = await parseWithLlmExtraction(html, SOURCE, {
    config: { enabled: true, silicon: {} },
    chat: async () => ({ content: JSON.stringify({ items: [{ title: "无日期活动" }] }) }),
  });
  assert.equal(events2.length, 0);
});
