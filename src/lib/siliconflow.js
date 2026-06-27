const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "Qwen/Qwen3.5-35B-A3B";

export function getSiliconFlowConfig(env = process.env) {
  const apiKey = env.SILICONFLOW_API_KEY?.trim();
  const baseUrl = (env.SILICONFLOW_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = env.SILICONFLOW_MODEL?.trim() || DEFAULT_MODEL;

  return {
    enabled: Boolean(apiKey),
    apiKey,
    baseUrl,
    model,
    timeoutMs: Number(env.SILICONFLOW_TIMEOUT_MS || 60_000),
    enableThinking: env.SILICONFLOW_ENABLE_THINKING === "true",
  };
}

export async function createChatCompletion(
  { messages, responseFormat = "json_object", temperature = 0.2, maxTokens = 2048 },
  { config = getSiliconFlowConfig(), fetchImpl = fetch } = {},
) {
  if (!config.enabled) {
    throw new Error("缺少 SILICONFLOW_API_KEY");
  }

  const body = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    enable_thinking: config.enableThinking,
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || `SiliconFlow HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("SiliconFlow 返回空内容");
  }

  return {
    content: String(content).trim(),
    model: payload.model || config.model,
    usage: payload.usage || null,
  };
}

export function parseJsonFromModelContent(content) {
  const trimmed = String(content).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);
    throw new Error("无法解析模型 JSON 输出");
  }
}
