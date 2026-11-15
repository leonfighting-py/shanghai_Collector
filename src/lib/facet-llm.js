// 第 3 层：LLM 兜底补字段。默认关闭（LLM_FACETS_ENABLED=true 才跑）。
//
// 只在前三层之后**仍然缺**的字段上问模型，输入是标题、场馆、分类 + 详情页正文前 1500 字。
// 模型说的每一句都要能在正文里找到原文，否则丢弃 —— 这一层的价值是「读懂页面」，
// 不是「猜」。价格尤其如此：决策点① 已经确认票务站抓不到票价，让模型编一个更没意义。

import { AUDIENCE_LABELS } from "./audience.js";
import { DISTRICTS } from "./event-classify.js";
import { mapWithLimit } from "./parsers/shared.js";
import { createChatCompletion, getSiliconFlowConfig, parseJsonFromModelContent } from "./siliconflow.js";

const SYSTEM_PROMPT = `你是「上海活动雷达」的数据校对员。任务：只根据给定的页面正文，补出活动的地点信息。

输出要求（必须遵守）：
1. 只返回 JSON，不要 markdown，不要解释。
2. JSON 结构：{"items":[{"index":0,"district":"浦东","address":"上海市浦东新区世纪大道1952号","price_min":80,"price_max":680,"is_free":false,"audience":["亲子"]}]}
3. 正文里没有写的，一律给 null（数组给 []）。**禁止推测、禁止用常识补齐。**
4. district 只能取这 16 个值之一：${DISTRICTS.join("、")}。判断不了就给 null。
5. address 必须是从正文里原样摘出的上海地址，不要自己拼；不是上海的地址给 null。
6. price_min / price_max 必须是正文里出现过的数字，单位元。没写票价给 null。
7. is_free 只有在正文明确写了「免费」「免票」「无需门票」时才是 true；写了票价就是 false；看不出来给 null。
8. audience 只能取：${AUDIENCE_LABELS.join("、")}。没有明确指向给 []。`;

export function getFacetLlmConfig(env = process.env) {
  const silicon = getSiliconFlowConfig(env);
  return {
    enabled: env.LLM_FACETS_ENABLED === "true" && silicon.enabled,
    batchSize: Number(env.LLM_FACETS_BATCH_SIZE || 6),
    concurrency: Number(env.LLM_FACETS_CONCURRENCY || 2),
    silicon,
  };
}

/** 前三层之后还缺什么就只问什么 */
export function needsFacetHelp(event) {
  const missingDistrict = !event.district;
  const missingAddress = !event.address;
  const missingAudience = !Array.isArray(event.audience) || event.audience.length === 0;
  return missingDistrict || missingAddress || missingAudience;
}

/** 比较正文时忽略空格与标点：模型常把「1952 号」写成「1952号」 */
function normalizeForMatch(value = "") {
  return String(value).replace(/[\s\u00a0·•・,，。.、；;：:（）()【】\[\]"'"'']/g, "").toLowerCase();
}

function containsLoose(haystack, needle) {
  const text = normalizeForMatch(haystack);
  const target = normalizeForMatch(needle);
  return Boolean(target) && text.includes(target);
}

function toPriceNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number >= 0 && number <= 100000 ? number : null;
}

const FREE_WORDS = /免费|免票|无需门票|免门票/;

/**
 * 校验并清洗模型返回的一条结果。校验不过的字段一律置空，不报错、不整条丢弃。
 * @param {object} item 模型返回的单条
 * @param {string} excerpt 作为依据的正文
 * @returns {{district:string|null, address:string|null, price_min:number|null, price_max:number|null, is_free:boolean|null, audience:string[], rejected:string[]}}
 */
export function validateFacetItem(item, excerpt = "") {
  const rejected = [];
  const text = String(excerpt || "");

  let district = null;
  if (typeof item?.district === "string" && DISTRICTS.includes(item.district.trim())) {
    district = item.district.trim();
  } else if (item?.district !== null && item?.district !== undefined && item?.district !== "") {
    rejected.push("district");
  }

  // 地址必须是正文里能找到的原文，否则就是拼出来的
  let address = null;
  const rawAddress = typeof item?.address === "string" ? item.address.trim() : "";
  if (rawAddress && rawAddress.length >= 6 && rawAddress.length <= 80 && containsLoose(text, rawAddress)) {
    address = rawAddress;
  } else if (rawAddress) {
    rejected.push("address");
  }

  // 价格数字必须能在正文里原样找到：模型算出来/换算过的价格不予采信
  let priceMin = toPriceNumber(item?.price_min);
  let priceMax = toPriceNumber(item?.price_max);
  if (priceMin !== null && !containsLoose(text, String(priceMin))) {
    rejected.push("price_min");
    priceMin = null;
  }
  if (priceMax !== null && !containsLoose(text, String(priceMax))) {
    rejected.push("price_max");
    priceMax = null;
  }
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    rejected.push("price_range");
    priceMin = null;
    priceMax = null;
  }

  let isFree = null;
  if (item?.is_free === true) {
    // 说免费就必须有免费字样，否则这条判定没有依据
    if (FREE_WORDS.test(text)) isFree = true;
    else rejected.push("is_free");
  } else if (item?.is_free === false) {
    // 说收费要求正文里出现票价或「元」，避免把「没写」当成「收费」
    isFree = /[¥￥]|\d+\s*元|票价/.test(text) ? false : null;
    if (isFree === null) rejected.push("is_free");
  }

  const audience = Array.isArray(item?.audience)
    ? [...new Set(item.audience.filter((label) => AUDIENCE_LABELS.includes(label)))]
    : [];

  return { district, address, price_min: priceMin, price_max: priceMax, is_free: isFree, audience, rejected };
}

/** 把校验通过的值写回事件；只填空缺，不覆盖已有值 */
export function applyFacetSuggestion(event, suggestion) {
  const provenance = { ...(event.facet_provenance || {}) };
  let changed = false;

  if (!event.district && suggestion.district) {
    // 区域平时是派生字段，只有 LLM 给的这份会被 repository 落库（其余每次实时算）
    event.district = suggestion.district;
    provenance.district = "llm";
    changed = true;
  }
  if (!event.address && suggestion.address) {
    event.address = suggestion.address;
    provenance.address = "llm";
    changed = true;
  }
  if (event.price_min === null || event.price_min === undefined) {
    if (suggestion.price_min !== null) {
      event.price_min = suggestion.price_min;
      provenance.price = "llm";
      changed = true;
    }
  }
  if (event.price_max === null || event.price_max === undefined) {
    if (suggestion.price_max !== null) {
      event.price_max = suggestion.price_max;
      provenance.price = "llm";
      changed = true;
    }
  }
  if ((event.is_free === null || event.is_free === undefined) && suggestion.is_free !== null) {
    event.is_free = suggestion.is_free;
    provenance.is_free = "llm";
    changed = true;
  }
  if (suggestion.audience.length > 0) {
    const merged = new Set([...(event.audience || []), ...suggestion.audience]);
    const next = AUDIENCE_LABELS.filter((label) => merged.has(label));
    if (next.length !== (event.audience || []).length) {
      event.audience = next;
      provenance.audience = "llm";
      changed = true;
    }
  }

  if (changed) event.facet_provenance = provenance;
  return { event, changed };
}

/**
 * 对一批活动做 LLM 兜底。
 *
 * @param {Array<object>} events 已过前三层的活动
 * @param {{config?: object, excerpts?: Map<string,string>, chat?: Function, fetchImpl?: Function}} options
 *        excerpts: signup_url → 详情页正文
 */
export async function backfillFacetsWithLlm(events, options = {}) {
  const config = options.config || getFacetLlmConfig(options.env);
  const empty = { enabled: config.enabled, asked: 0, filled: 0, rejected: 0, failures: [] };
  if (!config.enabled) return empty;

  const excerpts = options.excerpts instanceof Map ? options.excerpts : new Map();
  const queue = [];
  for (const event of events) {
    const excerpt = excerpts.get(event.signup_url);
    if (!excerpt || excerpt.length < 80) continue; // 正文太短，问了也只能瞎猜
    if (!needsFacetHelp(event)) continue;
    queue.push({ index: queue.length + 1, event, excerpt });
  }
  if (queue.length === 0) return empty;

  const failures = [];
  let filled = 0;
  let rejected = 0;

  await mapWithLimit(chunkArray(queue, config.batchSize), config.concurrency, async (batch) => {
    const payload = batch.map(({ index, event, excerpt }) => ({
      index,
      title: event.title,
      venue: event.venue,
      category: event.category,
      excerpt: excerpt.slice(0, 1500),
    }));

    try {
      const { content } = await (options.chat || createChatCompletion)(
        {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `请校对以下 ${payload.length} 条活动的字段：\n${JSON.stringify(payload, null, 2)}` },
          ],
          responseFormat: "json_object",
          temperature: 0.1,
          maxTokens: Math.min(2048, 300 * payload.length + 400),
        },
        { config: config.silicon, fetchImpl: options.fetchImpl },
      );

      const parsed = parseJsonFromModelContent(content);
      const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];

      for (const row of batch) {
        const item = items.find((candidate) => Number(candidate.index) === row.index);
        if (!item) {
          rejected += 1;
          continue;
        }
        const suggestion = validateFacetItem(item, row.excerpt);
        if (suggestion.rejected.length > 0) rejected += suggestion.rejected.length;
        if (applyFacetSuggestion(row.event, suggestion).changed) filled += 1;
      }
    } catch (error) {
      failures.push({
        message: error instanceof Error ? error.message : String(error),
        count: batch.length,
      });
    }
  });

  return { enabled: true, asked: queue.length, filled, rejected, failures };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
