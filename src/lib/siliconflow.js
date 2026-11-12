const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "Qwen/Qwen3.5-35B-A3B";
const DEFAULT_BUDGET_MAX_CALLS = 1000;

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

// LLM 调用预算熔断：单次采集周期内限制总调用次数，防止批次爆炸或误开开关烧掉意外 token。
// 软熔断设计——超阈值后 createChatCompletion 抛带 code 的 Error，上层（enrich/classify/llm-extract）
// 已对每个 batch try/catch，会把失败记入 failures 并跳过该批次，采集继续，已抓数据照常发布。
export function getLlmBudgetConfig(env = process.env) {
  const raw = Number(env.LLM_BUDGET_MAX_CALLS);
  return {
    enabled: env.LLM_BUDGET_ENABLED !== "false",
    maxCalls: Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_MAX_CALLS,
  };
}

let budgetState = { used: 0, cap: DEFAULT_BUDGET_MAX_CALLS, enabled: true };

// 采集主流程（runCollectJob）在开始时调用，重置计数并按当前环境变量刷新上限。
export function resetLlmBudget(env = process.env) {
  const config = getLlmBudgetConfig(env);
  budgetState = { used: 0, cap: config.maxCalls, enabled: config.enabled };
  return getLlmBudgetUsage();
}

export function getLlmBudgetUsage() {
  return { used: budgetState.used, cap: budgetState.cap, enabled: budgetState.enabled };
}

function tickLlmBudget() {
  if (!budgetState.enabled) return;
  if (budgetState.used >= budgetState.cap) {
    const error = new Error(
      `LLM 预算已用尽（已用 ${budgetState.used} / 上限 ${budgetState.cap} 次调用）`,
    );
    error.code = "LLM_BUDGET_EXCEEDED";
    throw error;
  }
  budgetState.used += 1;
}

export async function createChatCompletion(
  { messages, responseFormat = "json_object", temperature = 0.2, maxTokens = 2048 },
  { config = getSiliconFlowConfig(), fetchImpl = fetch } = {},
) {
  if (!config.enabled) {
    throw new Error("缺少 SILICONFLOW_API_KEY");
  }

  tickLlmBudget();

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
