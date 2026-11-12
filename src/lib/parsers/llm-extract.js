import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildEvent } from "./shared.js";
import { stripTags } from "./shared.js";
import { createChatCompletion, getSiliconFlowConfig, parseJsonFromModelContent } from "../siliconflow.js";

// 通用 LLM 抽取 parser：新增源无需手写 parser，LLM 从正文文本抽取结构化事件。
// 适用前提：页面有 SSR 正文（纯 JS 壳页面正文为空，抽不出任何东西）。
// 成本控制：需显式开启 LLM_EXTRACT_ENABLED=true 且配置 SILICONFLOW_API_KEY。
// 系统提示词外置为 markdown（prompts/llm-extract.md），便于非工程同事审阅与调优。

const MAX_TEXT_CHARS = 8000;

const PROMPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "prompts", "llm-extract.md");
let cachedSystemPrompt;
function getSystemPrompt() {
  if (cachedSystemPrompt === undefined) {
    cachedSystemPrompt = readFileSync(PROMPT_PATH, "utf8").trim();
  }
  return cachedSystemPrompt;
}

export function getLlmExtractConfig(env = process.env) {
  const silicon = getSiliconFlowConfig(env);
  return {
    enabled: env.LLM_EXTRACT_ENABLED === "true" && silicon.enabled,
    silicon,
  };
}

export function extractPageText(html) {
  return stripTags(html)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export async function parseWithLlmExtraction(html, source, context = {}) {
  const config = context.config || getLlmExtractConfig(context.env);
  const text = extractPageText(html);

  // 正文太短基本是 JS 壳页面，不值得调用模型
  if (!config.enabled || text.length < 200) return [];

  const chat = context.chat || createChatCompletion;
  let content;
  try {
    const response = await chat(
      {
        messages: [
          { role: "system", content: getSystemPrompt() },
          {
            role: "user",
            content: `来源：${source.name}（${source.url}）\n分类：${source.category}\n\n正文文本：\n${text}`,
          },
        ],
        responseFormat: "json_object",
        temperature: 0.1,
        maxTokens: 3000,
      },
      { config: config.silicon },
    );
    content = response.content;
  } catch {
    // LLM 失败按零召回处理，由源健康报告呈现，不中断整个采集
    return [];
  }

  const parsed = parseJsonFromModelContent(content);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  const events = [];
  for (const item of items) {
    const event = buildEvent({
      title: item?.title,
      start_time: item?.start,
      end_time: item?.end || null,
      venue: item?.venue || "上海",
      signup_url: item?.url || source.url,
      image_url: item?.image,
      source,
    });
    if (event) events.push(event);
  }

  return events.slice(0, 20);
}
