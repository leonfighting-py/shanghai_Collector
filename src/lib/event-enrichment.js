import { isEventLikeTitle, buildDedupeKey } from "./events.js";
import { mapWithLimit } from "./parsers/shared.js";
import { createChatCompletion, getSiliconFlowConfig, parseJsonFromModelContent } from "./siliconflow.js";

const SYSTEM_PROMPT = `你是「上海活动雷达」的编辑。任务：把采集到的原始活动信息整理成统一、可扫读的标题和一句简介。

输出要求（必须遵守）：
1. 只返回 JSON，不要 markdown，不要解释。
2. JSON 结构：{"items":[{"index":0,"title":"...","summary":"..."}]}
3. title：8-16 字（英文翻译为中文），写清楚「是什么活动」；简短、讲述召回输入的内容，不要任何过多的修饰。
4. summary：16-30 字，一句话说明亮点，并点出时间或地点；语气克制，不用空泛营销词。
5. 保留原文中的展览名、艺人名、场馆名；地点在上海的活动 venue 可简化但勿改城市。
6. 若 raw_title 已是清晰活动名，可微调措辞，不要完全改写事实。
7. 对每个输入 index 都必须返回一条 items。`;

export function getEventEnrichmentConfig(env = process.env) {
  const silicon = getSiliconFlowConfig(env);
  const sourceFilter = (env.LLM_ENRICHMENT_SOURCES || "all")
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    enabled: env.LLM_ENRICHMENT_ENABLED === "true" && silicon.enabled,
    batchSize: Number(env.LLM_ENRICHMENT_BATCH_SIZE || 8),
    concurrency: Number(env.LLM_ENRICHMENT_CONCURRENCY || 2),
    sourceFilter,
    silicon,
  };
}

export function shouldEnrichEvent(event, config = getEventEnrichmentConfig()) {
  if (!config.enabled) return false;
  if (config.sourceFilter.includes("all")) return true;
  if (config.sourceFilter.includes("wechat")) {
    return Boolean(event.source_name?.includes("公众号"));
  }
  return config.sourceFilter.some((name) => event.source_name?.includes(name));
}

export async function enrichEventsForPublish(events, options = {}) {
  const config = options.config || getEventEnrichmentConfig(options.env);
  if (!config.enabled || events.length === 0) {
    return { events, enrichedCount: 0, skippedCount: events.length, failures: [] };
  }

  const targets = events.map((event, index) => ({ event, index }));
  const toEnrich = targets.filter(({ event }) => shouldEnrichEvent(event, config));
  const skippedCount = events.length - toEnrich.length;
  const failures = [];
  let enrichedCount = 0;

  const enrichedByIndex = new Map();

  await mapWithLimit(
    chunkArray(toEnrich, config.batchSize),
    config.concurrency,
    async (batch) => {
      try {
        const results = await enrichEventBatch(batch.map(({ event, index }) => ({ event, index })), {
          config,
          chat: options.chat,
          fetchImpl: options.fetchImpl,
        });
        for (const item of results) {
          enrichedByIndex.set(item.index, item);
          enrichedCount += 1;
        }
      } catch (error) {
        failures.push({
          message: error instanceof Error ? error.message : String(error),
          indexes: batch.map(({ index }) => index),
        });
      }
    },
  );

  const merged = events.map((event, index) => {
    const enriched = enrichedByIndex.get(index);
    if (!enriched) return event;
    return applyEnrichment(event, enriched);
  });

  return { events: merged, enrichedCount, skippedCount, failures };
}

async function enrichEventBatch(batch, { config = getEventEnrichmentConfig(), chat = createChatCompletion, fetchImpl } = {}) {
  const payload = batch.map(({ event, index }) => ({
    index,
    raw_title: event.title,
    category: event.category,
    venue: event.venue,
    start_time: formatShanghaiLabel(event.start_time),
    end_time: event.end_time ? formatShanghaiLabel(event.end_time) : null,
    source: event.source_name,
  }));

  const { content } = await chat(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `请整理以下 ${payload.length} 条上海活动，按 index 返回 title 与 summary：\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      responseFormat: "json_object",
      temperature: 0.2,
      maxTokens: Math.min(4096, 280 * payload.length + 400),
    },
    { config: config.silicon, fetchImpl },
  );

  const parsed = parseJsonFromModelContent(content);
  const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];

  return batch.map(({ event, index }) => {
    const item = items.find((entry) => Number(entry.index) === index);
    return normalizeEnrichmentItem(event, index, item);
  });
}

function normalizeEnrichmentItem(event, index, item) {
  const title = sanitizeTitle(item?.title, event.title);
  const summary = sanitizeSummary(item?.summary);

  return {
    index,
    title,
    summary,
    original_title: event.title,
  };
}

function applyEnrichment(event, enriched) {
  const next = {
    ...event,
    original_title: enriched.original_title || event.original_title || event.title,
    summary: enriched.summary || event.summary || "",
  };

  if (enriched.title && enriched.title !== event.title) {
    next.title = enriched.title;
    next.dedupe_key = buildDedupeKey(next);
  }

  return next;
}

function sanitizeTitle(candidate, fallback) {
  const text = String(candidate || "").replace(/\s+/g, " ").trim();
  if (text.length >= 6 && text.length <= 80 && isEventLikeTitle(text)) return text;
  return fallback;
}

function sanitizeSummary(candidate) {
  const text = String(candidate || "").replace(/\s+/g, " ").trim();
  if (text.length < 12 || text.length > 120) return "";
  if (/^(点击查看|扫码|关注公众号)/.test(text)) return "";
  return text;
}

function formatShanghaiLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
