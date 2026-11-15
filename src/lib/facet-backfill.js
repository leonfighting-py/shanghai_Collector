// 第 1 层字段补齐：把详情页抓到的地址/票价/免费/场馆写回活动。
// 抓取本身在 detail-fetch.js（与图片回填共用缓存），这里只管「怎么落到事件上」。

import { fetchDetails } from "./detail-fetch.js";

/** 这些场馆名等于「没说」，可以被详情页覆盖 */
const VAGUE_VENUES = new Set(["", "上海", "上海市"]);

function applyRecord(event, record, counts) {
  const provenance = { ...(event.facet_provenance || {}) };

  // 场馆只在场馆缺失或只写「上海」时回写：解析器已经给出具体场馆的不要覆盖
  if (VAGUE_VENUES.has(String(event.venue || "").trim()) && record.venue) {
    event.venue = record.venue;
    counts.venue += 1;
  }

  if (!event.image_url && record.image_url) event.image_url = record.image_url;

  if (!event.address && record.address) {
    event.address = record.address;
    provenance.address = "detail";
    counts.address += 1;
  }

  const hasPrice = event.price_min !== null && event.price_min !== undefined;
  const hasPriceMax = event.price_max !== null && event.price_max !== undefined;
  if (!hasPrice && !hasPriceMax && (record.price_min !== null || record.price_max !== null)) {
    event.price_min = record.price_min;
    event.price_max = record.price_max;
    provenance.price = "detail";
    counts.price += 1;
  }

  if ((event.is_free === null || event.is_free === undefined) && record.is_free !== null) {
    event.is_free = record.is_free;
    provenance.is_free = "detail";
    counts.is_free += 1;
  }

  if (Object.keys(provenance).length > 0) event.facet_provenance = provenance;
}

/**
 * 对一批活动补齐字段。原地修改并返回统计（计数按「本轮补上了多少条」算）。
 *
 * @param {Array<object>} events
 * @param {{fetcher: object, concurrency?: number, perHostConcurrency?: number}} options
 */
export async function backfillEventFacets(events, { fetcher, concurrency = 4, perHostConcurrency = 2 } = {}) {
  const empty = {
    attempted: 0,
    fetched: 0,
    cacheHits: 0,
    failed: 0,
    robotsDenied: 0,
    address: 0,
    price: 0,
    is_free: 0,
    venue: 0,
  };
  if (!fetcher) return empty;

  const targets = events.filter((event) => /^https?:\/\//i.test(String(event.signup_url || "")));
  if (targets.length === 0) return empty;

  const { records, stats } = await fetchDetails(
    targets.map((event) => event.signup_url),
    { fetcher, concurrency, perHostConcurrency },
  );

  const counts = { address: 0, price: 0, is_free: 0, venue: 0 };
  for (const event of targets) {
    const record = records.get(event.signup_url);
    if (!record) continue;
    applyRecord(event, record, counts);
  }

  return {
    attempted: stats.attempted,
    fetched: stats.network,
    cacheHits: stats.cache,
    failed: stats.failed,
    robotsDenied: stats.robotsDenied,
    ...counts,
  };
}
