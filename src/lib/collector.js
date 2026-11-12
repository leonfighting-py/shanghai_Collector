import {
  filterPublishableEvents,
  isInDateRange,
  mergeDuplicateEvents,
  toShanghaiDayWindow,
} from "./events.js";
import { defaultFetchHtml } from "./fetch-html.js";
import { checkRobots } from "./robots.js";
import { isRelevantPerformance } from "./parsers/shared.js";

export { defaultFetchHtml } from "./fetch-html.js";
export { parseJsonLdEvents } from "./parsers/json-ld.js";

// 信源数据（注册表 / 停采清单 / 分级规则）已拆到 ./sources/（2026-11-11 WP1）：
// 停采、新增、打标记改 seeds/ 下的数据文件即可，不用动本文件的调度逻辑。
// 这里重新导出拆分前的全部公开名字，scripts/ 与 test/ 下十几处 import 不用改。
export { SOURCE_SEEDS_RAW, SOURCE_SEEDS, LAND_SOURCES, OFFSHORE_SOURCES } from "./sources/index.js";
export { resolveSourceTier } from "./sources/tier.js";

// 失败原因分类：把原始错误字符串归入固定桶，供健康报告做可靠的趋势统计
// （替代之前 health-check 里 String(msg).split(':')[0] 的脆弱字符串前缀匹配）。
export function classifyFailure(message) {
  const text = String(message || "");
  if (/timed?\s*out|超时|after \d+s/i.test(text)) return "timeout";
  if (/429/.test(text)) return "rate_limited";
  if (/HTTP\s*4\d\d|HTTP 4\d\d/.test(text)) return "http_4xx";
  if (/HTTP\s*5\d\d|HTTP 5\d\d/.test(text)) return "http_5xx";
  if (/fetch failed|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ECONNRESET|ECONNREFUSED|EAI_AGAIN|getaddrinfo|TypeError|cert|ssl/i.test(text)) return "network";
  if (/parse|解析|JSON|无法|expected|unexpected token/i.test(text)) return "parse";
  return "unknown";
}

// 网络错误要能定位到机制。undici 的外层报错永远是 `fetch failed`，真正的原因藏在
// error.cause 里（UND_ERR_CONNECT_TIMEOUT = 连接阶段被丢包；ECONNREFUSED = 端口拒绝；
// ENETUNREACH/EHOSTUNREACH = 该地址家族不可达；EAI_AGAIN = DNS 抖动），
// happy-eyeballs 各自失败时 cause 是个 AggregateError，errors[] 里每个地址一条。
// 2026-10-13 / 10-15 嘉定图书馆源连续两轮只记下「fetch failed」，无从判断是哪一种 ——
// 采集只记 message，所以这里把 cause 链一并拼进 message。
export function describeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof Error)) return message;

  const labels = [];
  const seen = new Set();

  const walk = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 4 || seen.has(node)) return;
    seen.add(node);
    const children = Array.isArray(node.errors) ? node.errors : null;
    // AggregateError 只是「几个地址都没连上」的壳（happy-eyeballs 逐个失败），信息在每个子错误里
    if (!children) {
      // 只认字符串形式的 code（ECONNREFUSED / UND_ERR_CONNECT_TIMEOUT）；
      // DOMException 的 code 是数字（TimeoutError = 23），那是历史遗留编码，读不出信息。
      const code = typeof node.code === "string" ? node.code : "";
      const where = node.address ? `${node.address}${node.port ? `:${node.port}` : ""}` : "";
      const detail = node.message && node.message !== message ? node.message : "";
      if (code || where) labels.push([code, where].filter(Boolean).join(" "));
      else if (detail && node.name && node.name !== "Error") labels.push(`${node.name}: ${detail}`);
      else if (detail) labels.push(detail);
    }

    if (children) {
      for (const sub of children) walk(sub, depth + 1);
      return;
    }
    walk(node.cause, depth + 1);
  };

  walk(error.cause, 1);
  return labels.length ? `${message} (${labels.join(", ")})` : message;
}

async function withSourceTimeout(task, sourceName, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${sourceName} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// 有界并发度：与 source-health-check.js 的 CONCURRENCY 对齐。
// 慢源/超时不再拖垮整批采集时长。
const DEFAULT_CONCURRENCY = Number(process.env.COLLECTOR_CONCURRENCY) || 5;

// 同主机限速：并发 5 只保证「不超过 5 个请求在飞」，并不保证「同一站不会被同时打」——
// 池子里 245 个源分布在 184 个主机上，37 个主机挂了 2 个以上源（douban.com 9 个，
// 按真实分批最多 4 个并发打同一站）。Eventbrite 26 个源 + 活动行 16 个源就是被整站反爬
// 拦掉后停采的（见 RETIRED_SOURCE_NAMES 注释），所以对同一 host 改成
// 「串行 + 相邻两次请求至少间隔 minIntervalMs」，把 burst 摊平。
// ⚠️ 只管页面请求（列表页 + 详情页）；robots.txt 每轮每 origin 只有 1 次，保持原样。
// 关闭方式：COLLECTOR_HOST_MIN_INTERVAL_MS=0。
// 2026-10-21：默认值 1500 → 1000。10-19 那轮被 35 分钟 job 上限掐掉（35m27s），
// 限速是其中一份（另有两批新增源与 offshore 合并），先把间隔压到 1 秒留出余量；
// 要更宽松就设环境变量，不用改代码。
const configuredHostInterval = Number(process.env.COLLECTOR_HOST_MIN_INTERVAL_MS);
const DEFAULT_HOST_MIN_INTERVAL_MS =
  Number.isFinite(configuredHostInterval) && configuredHostInterval >= 0 ? configuredHostInterval : 1000;

// 限速会占掉时间预算：单源最坏 1 个列表 + 12 个详情，每个至少隔 minIntervalMs，
// 同主机还有别的源排队时更久 → 开启限速时源级超时从 45s 放宽到 90s。
const SOURCE_TIMEOUT_MS = 45_000;
const THROTTLED_SOURCE_TIMEOUT_MS = 90_000;

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 按 host 串行 + 最小间隔的请求闸门。
 * 同一 host 的请求排成一条链（并发 1），相邻两次之间至少等 minIntervalMs；
 * 不同 host 互不影响。任务失败只影响它自己的返回值，不会卡死该 host 后面的请求。
 */
export function createHostThrottle({ minIntervalMs = DEFAULT_HOST_MIN_INTERVAL_MS, sleepImpl = sleepMs } = {}) {
  const tails = new Map();
  const finishedAt = new Map();

  return function schedule(url, task) {
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      host = String(url);
    }

    const previous = tails.get(host) ?? Promise.resolve();
    const result = previous.then(async () => {
      const waitUntil = (finishedAt.get(host) ?? 0) + minIntervalMs;
      const wait = waitUntil - Date.now();
      if (wait > 0) await sleepImpl(wait);
      try {
        return await task();
      } finally {
        finishedAt.set(host, Date.now());
      }
    });

    // 链尾只用来排队，吞掉失败，避免一次报错把该 host 后续请求全带崩
    tails.set(host, result.then(() => {}, () => {}));
    return result;
  };
}

export async function collectEventsFromSources({
  sources = SOURCE_SEEDS,
  previousEvents = [],
  extraEvents = [],
  fetchHtml = defaultFetchHtml,
  now = new Date(),
  concurrency = DEFAULT_CONCURRENCY,
  hostMinIntervalMs = DEFAULT_HOST_MIN_INTERVAL_MS,
  respectRobots = process.env.COLLECTOR_RESPECT_ROBOTS !== "false",
} = {}) {
  const { startDate, endDate, days } = toShanghaiDayWindow(now);
  const failures = [];
  const collected = [];
  const robotsSkipped = [];

  const throttle = createHostThrottle({ minIntervalMs: hostMinIntervalMs });
  const fetchWithHostLimit = (url, ...rest) => throttle(url, () => fetchHtml(url, ...rest));
  const sourceTimeoutMs = hostMinIntervalMs > 0 ? THROTTLED_SOURCE_TIMEOUT_MS : SOURCE_TIMEOUT_MS;

  const collectOne = async (source) => {
    // robots 闸门：站点明示禁止抓取时跳过，记入 skipped 而非 failures，
    // 避免健康报告把「被 robots 拒绝」误判成「源已失效」。
    if (respectRobots) {
      try {
        const decision = await checkRobots(source.url);
        if (!decision.allowed) {
          return {
            events: [],
            failure: null,
            skipped: { source: source.name, url: source.url, reason: decision.reason || "robots_disallow" },
          };
        }
      } catch {
        // 闸门自身异常不应阻断采集
      }
    }
    try {
      const parsed = await withSourceTimeout(
        async () => {
          const html = await fetchWithHostLimit(source.url);
          return source.parser(html, source, { fetchHtml: fetchWithHostLimit, now, window: { startDate, endDate, days } });
        },
        source.name,
        source.timeoutMs || sourceTimeoutMs,
      );
      return { events: parsed, failure: null };
    } catch (error) {
      const message = describeError(error);
      return {
        events: [],
        failure: {
          source: source.name,
          url: source.url,
          message,
          kind: classifyFailure(message),
        },
      };
    }
  };

  const limit = Math.max(1, concurrency);
  for (let index = 0; index < sources.length; index += limit) {
    const chunk = sources.slice(index, index + limit);
    const outcomes = await Promise.all(chunk.map(collectOne));
    for (const outcome of outcomes) {
      if (outcome.failure) failures.push(outcome.failure);
      else if (outcome.skipped) robotsSkipped.push(outcome.skipped);
      else collected.push(...outcome.events);
    }
  }

  // 境外源（offshore.yml 预先采好、以 artifact 交过来）在这里并入同一批：
  // 之后统一走 filterPublishableEvents + 窗口 + 去重，口径与境内源完全一致。
  if (extraEvents.length > 0) collected.push(...extraEvents);

  const events = mergeDuplicateEvents(
    filterPublishableEvents(collected)
      .filter((event) => isInDateRange(event, startDate, endDate))
      .filter((event) => event.category !== "演出音乐" || isRelevantPerformance(event)),
  );

  if (events.length === 0 && previousEvents.length > 0) {
    return {
      ok: false,
      events: previousEvents,
      failures,
      robotsSkipped,
      collectedCount: 0,
      publishedCount: previousEvents.length,
      startDate,
      endDate,
      windowDays: days,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    ok: failures.length === 0,
    events,
    failures,
    robotsSkipped,
    rawEvents: collected,
    collectedCount: collected.length,
    publishedCount: events.length,
    startDate,
    endDate,
    windowDays: days,
    lastUpdatedAt: new Date().toISOString(),
  };
}
