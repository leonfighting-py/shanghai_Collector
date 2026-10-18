import { resolveDispatcher } from "./proxy-registry.js";

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
const DEFAULT_TIMEOUT_MS = 12_000;

function isRetryableError(error, status) {
  if (error instanceof TypeError) return true; // Node fetch 网络/连接错误
  if (status && RETRYABLE_STATUS.has(status)) return true;
  return false;
}

export async function fetchWithRetry(url, { retries = DEFAULT_RETRY_COUNT, baseDelayMs = DEFAULT_RETRY_BASE_MS, fetchImpl = fetch, sleepImpl = sleep, timeoutMs, signal, ...options } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    let status;
    try {
      // 超时预算必须「每次尝试各给一份」。AbortSignal.timeout() 从创建那一刻就开始倒计时，
      // 在循环外建一个再传进来会被三次尝试共享：2026-10-16 实测（嘉定图书馆源）第一次尝试
      // 卡满 undici 的连接超时 10s 后才失败，第二次尝试刚起步 ~1.4s 就被这个共享 signal
      // 中止，报 TimeoutError（不可重试）→ 第三次根本没机会跑，"重试 3 次"退化成 1 次多。
      // 调用方给了 signal 就照旧当整段操作的预算用（不再叠加 timeoutMs）。
      const attemptSignal = signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);
      response = await fetchImpl(url, { ...options, signal: attemptSignal });
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

// Node 的 response.text() 固定按 UTF-8 解码，不看 Content-Type 里的 charset（浏览器会看）。
// GBK 站的正文会整片变成 U+FFFD：2026-10-12 实测 meeting.xjtu.edu.cn —— 响应头 charset=gbk、
// 字节也确实是 GBK，而页内 <meta charset="UTF-8"> 是错的（写错了的站并不少见）。
// 所以判断顺序必须是「响应头 charset → 页内 meta → UTF-8」，不能反过来信 meta。
const META_CHARSET_RE = /<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9._-]+)/i;

export function parseContentTypeCharset(contentType) {
  const match = /charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(String(contentType || ""));
  return match ? match[1].toLowerCase() : "";
}

function sniffMetaCharset(bytes) {
  // meta 一定在 head 里，只解开头一段就够；用 UTF-8 解，ASCII 部分（含 charset 名字）不受影响
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 4096));
  const match = META_CHARSET_RE.exec(head);
  return match ? match[1].toLowerCase() : "";
}

export function decodeHtmlBytes(bytes, contentType = "") {
  const label = parseContentTypeCharset(contentType) || sniffMetaCharset(bytes) || "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // 认不出的标签（拼错 / 私有编码）→ 退回 UTF-8，别让整个源因此挂掉
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// 出口代理（可选）：境外源在境内 runner 上会被 403/405（Eventbrite / 活动行 / Meetup / Lu.ma），
// 同一 URL 换住宅 IP 或境外出口就是 200。dispatcher 由 `outbound-proxy.js` 在采集进程启动时注入
// （见 proxy-registry.js）；没注入时 resolveDispatcher 返回 undefined，行为与改造前完全一致。
// ⚠️ 这里不能直接 import undici：本文件也会被 Cloudflare Workers 的页面构建打包。

export async function defaultFetchHtml(url) {
  const response = await fetchWithRetry(url, {
    retries: DEFAULT_RETRY_COUNT,
    headers: headersFor(url),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dispatcher: resolveDispatcher(url),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return decodeHtmlBytes(new Uint8Array(await response.arrayBuffer()), response.headers.get("content-type"));
}

export async function defaultFetchJson(url) {
  const response = await fetchWithRetry(url, {
    retries: DEFAULT_RETRY_COUNT,
    headers: headersFor(url),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dispatcher: resolveDispatcher(url),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
