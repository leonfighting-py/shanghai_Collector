// 详情页共用抓取：图片回填与字段补齐走同一条路，同一个地址一轮采集只请求一次。
//
// 三级缓存：
//   1. 本轮内 memo —— 两个阶段先后问同一个 URL，只抓一次
//   2. 跨轮持久缓存 event_detail_cache —— 发布是按窗口全量替换的，不缓存就要每两天把所有详情页重抓一遍
//   3. 都没有才发请求，遵守 robots.txt
//
// 缓存存的是**提取结果**而不是 HTML：一页 40 KB 上下，266 条就是 10 MB，
// 跨境传输比重新抽一遍贵得多（raw_event_ids 2 MB 拖垮过一次采集）。

import { extractFacets } from "./facet-extract.js";
import { defaultFetchHtml } from "./fetch-html.js";
import { extractDetailImage } from "./image-backfill.js";
import { checkRobots } from "./robots.js";

/** 详情页里我们能拿到的东西；名字与 events 表字段对齐 */
export function extractDetailRecord(html) {
  const facets = extractFacets(html);
  return {
    image_url: extractDetailImage(html) || null,
    venue: facets.venue || "",
    address: facets.address || "",
    price_min: facets.price_min,
    price_max: facets.price_max,
    is_free: facets.is_free,
    facet_provenance: facets.provenance || {},
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * @param {{fetchHtml?: Function, robotsCheck?: Function}} options
 */
export function createDetailFetcher({ fetchHtml = defaultFetchHtml, robotsCheck = checkRobots } = {}) {
  /** 跨轮缓存（由 repository.readDetailCache 预载） */
  const persisted = new Map();
  /** 本轮请求结果，按 URL 去重 */
  const memo = new Map();
  /** 本轮真正走网络的记录，等采集结束时批量写库 */
  const fetched = new Map();

  function preload(records) {
    if (!records) return;
    for (const [url, record] of records) {
      if (!persisted.has(url)) persisted.set(url, record);
    }
  }

  async function load(url) {
    if (persisted.has(url)) return { record: persisted.get(url), source: "cache" };

    const decision = await robotsCheck(url);
    if (!decision.allowed) {
      const error = new Error(`robots:${decision.reason || "disallowed"}`);
      error.code = "robots";
      throw error;
    }

    const record = extractDetailRecord(await fetchHtml(url));
    fetched.set(url, record);
    return { record, source: "network" };
  }

  async function get(url) {
    if (memo.has(url)) return memo.get(url);
    const promise = load(url).catch((error) => {
      // 失败不留在 memo 里：同一轮另一个阶段还想试一次
      memo.delete(url);
      throw error;
    });
    memo.set(url, promise);
    return promise;
  }

  return {
    preload,
    get,
    /** 本轮新抓到的记录（Map<url, record>），交给 repository.writeDetailCache */
    drainPending() {
      return new Map(fetched);
    },
    pendingSize() {
      return fetched.size;
    },
  };
}

/**
 * 批量抓取。按主机分组：不同主机并行，同主机最多 perHostConcurrency 条同时进行。
 * 单条失败静默跳过并计数，不影响整轮采集。
 *
 * @returns {Promise<{records: Map<string, object>, stats: object}>}
 */
export async function fetchDetails(
  urls,
  { fetcher, concurrency = 4, perHostConcurrency = 2, onResult } = {},
) {
  const unique = [...new Set((urls || []).filter((url) => /^https?:\/\//i.test(String(url || ""))))];
  const stats = { attempted: unique.length, network: 0, cache: 0, robotsDenied: 0, failed: 0 };
  const records = new Map();

  const byHost = new Map();
  for (const url of unique) {
    const host = hostOf(url) || "unknown";
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(url);
  }

  const hostQueues = [...byHost.values()];
  let cursor = 0;

  async function runOne(url) {
    try {
      const { record, source } = await fetcher.get(url);
      records.set(url, record);
      if (source === "cache") stats.cache += 1;
      else stats.network += 1;
      if (typeof onResult === "function") onResult(url, record, null);
    } catch (error) {
      if (error?.code === "robots") stats.robotsDenied += 1;
      else stats.failed += 1;
      if (typeof onResult === "function") onResult(url, null, error);
    }
  }

  async function worker() {
    while (cursor < hostQueues.length) {
      const hostUrls = hostQueues[cursor];
      cursor += 1;
      for (let index = 0; index < hostUrls.length; index += perHostConcurrency) {
        await Promise.all(hostUrls.slice(index, index + perHostConcurrency).map(runOne));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, hostQueues.length) }, worker));
  return { records, stats };
}
