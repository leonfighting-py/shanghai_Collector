import test from "node:test";
import assert from "node:assert/strict";

import { createDetailFetcher } from "../src/lib/detail-fetch.js";
import { backfillEventFacets } from "../src/lib/facet-backfill.js";

const RECORD = {
  image_url: "https://cdn.example.com/cover.jpg",
  venue: "上海大剧院",
  address: "上海市黄浦区人民大道300号",
  price_min: 180,
  price_max: 680,
  is_free: false,
  facet_provenance: { address: "jsonld", price: "jsonld" },
};

/** 预载缓存的 fetcher：不发请求，直接命中 */
function cachedFetcher(record = RECORD) {
  const fetcher = createDetailFetcher({
    fetchHtml: async () => {
      throw new Error("不该发请求");
    },
    robotsCheck: async () => ({ allowed: true }),
  });
  fetcher.preload(new Map([["https://a.example.com/e/1", record]]));
  return fetcher;
}

function makeEvent(overrides = {}) {
  return {
    title: "上海交响乐团开幕音乐会",
    start_time: "2026-11-20T19:30:00+08:00",
    venue: "上海",
    category: "演出音乐",
    signup_url: "https://a.example.com/e/1",
    ...overrides,
  };
}

test("场馆只写「上海」时用详情页的场馆回写", async () => {
  const events = [makeEvent()];
  const stats = await backfillEventFacets(events, { fetcher: cachedFetcher() });

  assert.equal(events[0].venue, "上海大剧院");
  assert.equal(stats.venue, 1);
});

test("解析器已经给出具体场馆时不覆盖", async () => {
  const events = [makeEvent({ venue: "上海交响乐团音乐厅" })];
  await backfillEventFacets(events, { fetcher: cachedFetcher() });

  assert.equal(events[0].venue, "上海交响乐团音乐厅");
});

test("地址/票价/免费只补空值，不覆盖已有值", async () => {
  const events = [
    makeEvent({ address: "解析器给的地址", price_min: 100, price_max: 100, is_free: true }),
  ];
  const stats = await backfillEventFacets(events, { fetcher: cachedFetcher() });

  assert.equal(events[0].address, "解析器给的地址");
  assert.equal(events[0].price_min, 100);
  assert.equal(events[0].is_free, true);
  assert.equal(stats.address, 0);
  assert.equal(stats.price, 0);
  assert.equal(stats.is_free, 0);
});

test("空值补齐，并在 facet_provenance 里记 detail", async () => {
  const events = [makeEvent()];
  const stats = await backfillEventFacets(events, { fetcher: cachedFetcher() });

  assert.equal(events[0].address, "上海市黄浦区人民大道300号");
  assert.equal(events[0].price_min, 180);
  assert.equal(events[0].price_max, 680);
  assert.equal(events[0].is_free, false);
  assert.deepEqual(events[0].facet_provenance, {
    address: "detail",
    price: "detail",
    is_free: "detail",
  });
  assert.equal(stats.address, 1);
  assert.equal(stats.price, 1);
  assert.equal(stats.is_free, 1);
});

test("无图事件顺手补上封面", async () => {
  const events = [makeEvent()];
  await backfillEventFacets(events, { fetcher: cachedFetcher() });
  assert.equal(events[0].image_url, "https://cdn.example.com/cover.jpg");
});

test("没有 signup_url 的活动直接跳过", async () => {
  const events = [makeEvent({ signup_url: "" })];
  const stats = await backfillEventFacets(events, { fetcher: cachedFetcher() });

  assert.equal(stats.attempted, 0);
  assert.equal(events[0].venue, "上海");
});

test("没有 fetcher 时安全返回，不改活动", async () => {
  const events = [makeEvent()];
  const stats = await backfillEventFacets(events, {});

  assert.equal(stats.attempted, 0);
  assert.equal(events[0].venue, "上海");
  assert.equal(events[0].address, undefined);
});

test("详情页什么都没抓到时不写空值", async () => {
  const empty = {
    image_url: null,
    venue: "",
    address: "",
    price_min: null,
    price_max: null,
    is_free: null,
    facet_provenance: {},
  };
  const events = [makeEvent()];
  const stats = await backfillEventFacets(events, { fetcher: cachedFetcher(empty) });

  assert.equal(events[0].address, undefined, "抓不到就保持原样，不要写空串");
  assert.equal(events[0].facet_provenance, undefined);
  assert.equal(stats.address, 0);
});
