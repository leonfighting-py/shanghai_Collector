import test from "node:test";
import assert from "node:assert/strict";

import { createDetailFetcher, extractDetailRecord, fetchDetails } from "../src/lib/detail-fetch.js";

const PAGE = `<!doctype html><html><head>
<meta property="og:image" content="https://cdn.example.com/cover.jpg" />
<script type="application/ld+json">{"@type":"Event","name":"x","location":{"@type":"Place","name":"上海大剧院","address":"上海市黄浦区人民大道300号"},"offers":{"@type":"Offer","price":"180"}}</script>
</head><body><p>票价 ¥180</p></body></html>`;

function fakeFetcher({ html = PAGE, fail = false } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (fail) throw new Error("boom");
    return html;
  };
  fn.calls = calls;
  return fn;
}

const allowAll = async () => ({ allowed: true });

test("从详情页一次抽出封面、场馆、地址、票价", () => {
  const record = extractDetailRecord(PAGE);
  assert.equal(record.image_url, "https://cdn.example.com/cover.jpg");
  assert.equal(record.venue, "上海大剧院");
  assert.equal(record.address, "上海市黄浦区人民大道300号");
  assert.equal(record.price_min, 180);
  assert.equal(record.price_max, 180);
  assert.equal(record.facet_provenance.address, "jsonld");
});

test("缓存命中的地址不再发请求", async () => {
  const fetchHtml = fakeFetcher();
  const fetcher = createDetailFetcher({ fetchHtml, robotsCheck: allowAll });

  fetcher.preload(new Map([["https://a.example.com/1", { venue: "缓存里的场馆", address: "", price_min: null, price_max: null, is_free: null, image_url: null, facet_provenance: {} }]]));

  const { record, source } = await fetcher.get("https://a.example.com/1");
  assert.equal(source, "cache");
  assert.equal(record.venue, "缓存里的场馆");
  assert.equal(fetchHtml.calls.length, 0, "缓存命中时不该发请求");
  assert.equal(fetcher.pendingSize(), 0, "缓存命中不该写回");
});

test("同一轮里同一地址只请求一次（两个阶段共用）", async () => {
  const fetchHtml = fakeFetcher();
  const fetcher = createDetailFetcher({ fetchHtml, robotsCheck: allowAll });

  const first = await fetcher.get("https://a.example.com/1");
  const second = await fetcher.get("https://a.example.com/1");

  assert.equal(first.source, "network");
  assert.equal(second.source, "network");
  assert.equal(fetchHtml.calls.length, 1, "第二个阶段应该复用第一个阶段的结果");
  assert.equal(fetcher.pendingSize(), 1);
});

test("robots 拒绝时不发请求，且不计入失败", async () => {
  const fetchHtml = fakeFetcher();
  const fetcher = createDetailFetcher({
    fetchHtml,
    robotsCheck: async () => ({ allowed: false, reason: "robots_disallow" }),
  });

  const { stats } = await fetchDetails(["https://a.example.com/1"], { fetcher });
  assert.equal(stats.robotsDenied, 1);
  assert.equal(stats.failed, 0);
  assert.equal(fetchHtml.calls.length, 0);
});

test("抓取失败计入 failed，不影响其他地址", async () => {
  let call = 0;
  const fetchHtml = async () => {
    call += 1;
    if (call === 1) throw new Error("boom");
    return PAGE;
  };
  const fetcher = createDetailFetcher({ fetchHtml, robotsCheck: allowAll });

  const { records, stats } = await fetchDetails(["https://a.example.com/1", "https://b.example.com/2"], {
    fetcher,
    concurrency: 2,
  });

  assert.equal(stats.failed, 1);
  assert.equal(stats.network, 1);
  assert.equal(records.size, 1);
  assert.ok(records.has("https://b.example.com/2"));
});

test("失败不留缓存，下一轮会重试", async () => {
  let attempts = 0;
  const fetchHtml = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("boom");
    return PAGE;
  };
  const fetcher = createDetailFetcher({ fetchHtml, robotsCheck: allowAll });

  await assert.rejects(() => fetcher.get("https://a.example.com/1"));
  const { record } = await fetcher.get("https://a.example.com/1");
  assert.equal(record.venue, "上海大剧院");
  assert.equal(attempts, 2);
});

test("fetchDetails 按主机分组：同主机不超过 2 条并发", async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchHtml = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return PAGE;
  };
  const fetcher = createDetailFetcher({ fetchHtml, robotsCheck: allowAll });
  const urls = ["1", "2", "3", "4", "5"].map((id) => `https://same.example.com/${id}`);

  await fetchDetails(urls, { fetcher });

  assert.equal(peak, 2, `同主机并发峰值应为 2，实际 ${peak}`);
});

test("非 http(s) 的地址直接跳过", async () => {
  const fetchHtml = fakeFetcher();
  const fetcher = createDetailFetcher({ fetchHtml, robotsCheck: allowAll });
  const { stats } = await fetchDetails(["javascript:alert(1)", "", null, "ftp://a/b"], { fetcher });
  assert.equal(stats.attempted, 0);
  assert.equal(fetchHtml.calls.length, 0);
});
