import { CATEGORIES } from "./events.js";
import { mapWithLimit } from "./parsers/shared.js";
import { createChatCompletion, getSiliconFlowConfig, parseJsonFromModelContent } from "./siliconflow.js";

const AI_POSITIVE_PATTERN =
  /\b(ai|artificial intelligence|llm|gpt|machine learning|deep learning|agent|openclaw|tinkerers?|hackathon|developer|tech mixer|data science|neural|aigc|copilot|chatgpt|claude|gemini)\b|人工智能|大模型|智能体|黑客松|开发者|机器学习|深度学习/i;

const AI_NEGATIVE_PATTERN =
  /\b(board game|tabletop|clank!?|dnd|d&d|iran air|655|jim morrison|humorist)\b|桌游|伊朗航空|吉姆·莫里森|剧本杀|狼人杀|相亲|瑜伽|跑步|羽毛球|足球赛/i;

const SYSTEM_PROMPT = `你是「上海活动雷达」的分类审核员。根据活动标题、简介、场馆、来源名称，判断它应展示在哪个分类。

可选分类（必须从中选一个）：
- 演出音乐：演唱会、Live、音乐节、演出
- 展览：艺术展、特展、博物馆展览
- 线下活动：市集、聚会、运动、见面会、一般线下活动
- 高校讲座：高校/大学主办的讲座、论坛、开放日
- AI聚会：核心主题是 AI/ML/LLM/智能体/开发者技术交流/AI 创业或 AI 产品，而不是仅举办方名字里带 AI

重要：
1. 举办方是 "AI Tinkerers" 或 "ShanghAI AI Meetup" 但活动内容是桌游、历史人文、普通社交酒会 → 不是 AI聚会，应改为 线下活动
2. 标题含 ShanghAI / AI Meetup 但实质是 tech social 且主题与 AI 相关 → 可以是 AI聚会
3. 与上海活动无关、或信息不足以判断 → keep=false

只返回 JSON，不要 markdown：
{"items":[{"index":0,"category":"线下活动","keep":true}]}`;

export function getCategoryFilterConfig(env = process.env) {
  const silicon = getSiliconFlowConfig(env);
  const enrichmentEnabled = env.LLM_ENRICHMENT_ENABLED === "true";
  const explicit = env.LLM_CATEGORY_FILTER_ENABLED;
  const enabled =
    silicon.enabled &&
    (explicit === "true" || (explicit !== "false" && enrichmentEnabled));

  return {
    enabled,
    batchSize: Number(env.LLM_CATEGORY_BATCH_SIZE || 10),
    concurrency: Number(env.LLM_CATEGORY_CONCURRENCY || 2),
    silicon,
  };
}

/** @returns {true|false|null} true=AI相关, false=明显不是, null=不确定 */
export function isAiMeetupContent(event) {
  const text = `${event.title} ${event.summary || ""} ${event.source_name || ""}`;
  if (AI_NEGATIVE_PATTERN.test(text)) return false;
  if (AI_POSITIVE_PATTERN.test(text)) return true;
  return null;
}

export function ruleFilterCategory(event) {
  if (event.category !== "AI聚会") {
    return { keep: true, category: event.category, reason: "non-ai-category" };
  }

  const verdict = isAiMeetupContent(event);
  if (verdict === false) {
    return { keep: true, category: "线下活动", reason: "ai-negative-rule" };
  }
  if (verdict === true) {
    return { keep: true, category: "AI聚会", reason: "ai-positive-rule" };
  }

  return { keep: true, category: event.category, reason: "uncertain", needsLlm: true };
}

export async function filterEventCategories(events, options = {}) {
  const config = options.config || getCategoryFilterConfig(options.env);
  const decisions = events.map((event) => ruleFilterCategory(event));
  const failures = [];

  if (config.enabled) {
    const llmTargets = events
      .map((event, index) => ({ event, index, decision: decisions[index] }))
      .filter(
        ({ event, decision }) =>
          event.category === "AI聚会" && decision.reason !== "ai-negative-rule",
      );

    await mapWithLimit(
      chunkArray(llmTargets, config.batchSize),
      config.concurrency,
      async (batch) => {
        try {
          const results = await classifyEventBatch(batch, { config, chat: options.chat });
          for (const item of results) {
            decisions[item.index] = {
              keep: item.keep,
              category: item.category,
              reason: "llm",
            };
          }
        } catch (error) {
          failures.push({
            message: error instanceof Error ? error.message : String(error),
            indexes: batch.map(({ index }) => index),
          });
        }
      },
    );
  }

  const filtered = [];
  let reclassifiedCount = 0;
  let rejectedCount = 0;

  for (let index = 0; index < events.length; index += 1) {
    const decision = decisions[index];
    if (!decision.keep) {
      rejectedCount += 1;
      continue;
    }

    const nextCategory = normalizeCategory(decision.category, events[index].category);
    if (nextCategory !== events[index].category) reclassifiedCount += 1;

    filtered.push({
      ...events[index],
      category: nextCategory,
      original_category: events[index].original_category || events[index].category,
    });
  }

  return {
    events: filtered,
    reclassifiedCount,
    rejectedCount,
    failures,
    enabled: config.enabled,
  };
}

async function classifyEventBatch(batch, { config, chat = createChatCompletion } = {}) {
  const payload = batch.map(({ event, index }) => ({
    index,
    title: event.title,
    summary: event.summary || "",
    venue: event.venue,
    source: event.source_name,
    current_category: event.category,
  }));

  const { content } = await chat(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `请审核以下 ${payload.length} 条活动的分类：\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      responseFormat: "json_object",
      temperature: 0.1,
      maxTokens: Math.min(2048, 120 * payload.length + 200),
    },
    { config: config.silicon, fetchImpl: undefined },
  );

  const parsed = parseJsonFromModelContent(content);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];

  return batch.map(({ event, index }) => {
    const item = items.find((entry) => Number(entry.index) === index);
    const category = normalizeCategory(item?.category, event.category);
    const keep = item?.keep !== false && Boolean(category);
    return { index, category, keep };
  });
}

function normalizeCategory(candidate, fallback) {
  const text = String(candidate || "").trim();
  if (CATEGORIES.includes(text)) return text;
  return CATEGORIES.includes(fallback) ? fallback : "线下活动";
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
