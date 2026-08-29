import { buildEvent } from "./shared.js";
import { stripTags } from "./shared.js";
import { createChatCompletion, getSiliconFlowConfig, parseJsonFromModelContent } from "../siliconflow.js";

// 通用 LLM 抽取 parser：新增源无需手写 parser，LLM 从正文文本抽取结构化事件。
// 适用前提：页面有 SSR 正文（纯 JS 壳页面正文为空，抽不出任何东西）。
// 成本控制：需显式开启 LLM_EXTRACT_ENABLED=true 且配置 SILICONFLOW_API_KEY。

const MAX_TEXT_CHARS = 8000;

const SYSTEM_PROMPT = `你是「上海活动雷达」的信息抽取器。输入是一个网页的正文文本，请从中抽取即将举行的线下活动/演出/展览/讲座。

输出要求（必须遵守）：
1. 只返回 JSON，不要 markdown，不要解释。
2. JSON 结构：{"items":[{"title":"...","start":"YYYY-MM-DD","end":"YYYY-MM-DD 或 null","venue":"...","url":"..."}]}
3. title：活动完整名称，保留展览名/艺人名，未提及城市时不要添加。
4. start：活动开始日期（YYYY-MM-DD）。只有年月时取当月 1 日。完全没有日期的活动跳过。
5. end：结束日期，单日活动为 null。
6. venue：场馆/地点，没有则填「上海」。
7. url：活动详情链接（相对路径转绝对），没有则留空字符串。
8. 只抽取未来会发生的公开活动；跳过导航、菜单、往期回顾、招聘、新闻类内容。
9. 没有可抽取的活动时返回 {"items":[]}。最多返回 20 条。`;

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
          { role: "system", content: SYSTEM_PROMPT },
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
      source,
    });
    if (event) events.push(event);
  }

  return events.slice(0, 20);
}
