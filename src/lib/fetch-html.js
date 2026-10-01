const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/json",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const MOBILE_HEADERS = {
  ...DEFAULT_HEADERS,
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

const SITE_HEADERS = {
  "maoyan.com": MOBILE_HEADERS,
  "show.maoyan.com": MOBILE_HEADERS,
  "10times.com": {
    ...DEFAULT_HEADERS,
    referer: "https://www.google.com/",
  },
};

function headersFor(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return SITE_HEADERS[host] || SITE_HEADERS[Object.keys(SITE_HEADERS).find((key) => host.endsWith(key))] || DEFAULT_HEADERS;
}

// 间歇性故障重试：网络抖动 / 临时 503 / Cloudflare 间歇 403 / 429 限流 都值得重试；
// 4xx（除 429）通常是稳定拒绝（被封禁/页面消失），重试无意义反而拖慢采集。
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_BASE_MS = 600;

function isRetryableError(error, status) {
  if (error instanceof TypeError) return true; // Node fetch 网络/连接错误
  if (status && RETRYABLE_STATUS.has(status)) return true;
  return false;
}

export async function fetchWithRetry(url, { retries = DEFAULT_RETRY_COUNT, baseDelayMs = DEFAULT_RETRY_BASE_MS, fetchImpl = fetch, sleepImpl = sleep, ...options } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    let status;
    try {
      response = await fetchImpl(url, options);
      status = response.status;
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableError(error)) {
        await sleepImpl(baseDelayMs * 2 ** attempt + jitter());
        continue;
      }
      throw error;
    }
    if (response.ok || !isRetryableError(null, status) || attempt === retries) {
      return response;
    }
    await response.text().catch(() => {});
    lastError = new Error(`HTTP ${status}`);
    await sleepImpl(baseDelayMs * 2 ** attempt + jitter());
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter() {
  return Math.floor(Math.random() * 150);
}

export async function defaultFetchHtml(url) {
  const response = await fetchWithRetry(url, {
    retries: DEFAULT_RETRY_COUNT,
    headers: headersFor(url),
    signal: AbortSignal.timeout(12_000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function defaultFetchJson(url) {
  const response = await fetchWithRetry(url, {
    retries: DEFAULT_RETRY_COUNT,
    headers: headersFor(url),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
