import test from "node:test";
import assert from "node:assert/strict";

import {
  extractAddress,
  extractFacets,
  extractFreeFlag,
  extractJsonLdEvent,
  extractPrice,
  toPlainText,
} from "../src/lib/facet-extract.js";

const page = (body = "", { jsonLd = null } = {}) => `<!doctype html><html><head>${
  jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""
}</head><body>${body}</body></html>`;

test("JSON-LD：offers.price 与 location.address 都能拿到", () => {
  const html = page("", {
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Event",
      name: "开幕音乐会",
      location: { "@type": "Place", name: "上海交响乐团音乐厅", address: "上海市徐汇区复兴中路1380号" },
      offers: { "@type": "Offer", price: "180" },
    },
  });
  const facets = extractFacets(html);
  assert.equal(facets.venue, "上海交响乐团音乐厅");
  assert.equal(facets.address, "上海市徐汇区复兴中路1380号");
  assert.equal(facets.price_min, 180);
  assert.equal(facets.price_max, 180);
  assert.equal(facets.provenance.address, "jsonld");
  assert.equal(facets.provenance.price, "jsonld");
  assert.equal(facets.has_json_ld_event, true);
});

test("JSON-LD：lowPrice / highPrice 取区间", () => {
  const html = page("", {
    jsonLd: { "@type": "Event", name: "x", offers: { "@type": "AggregateOffer", lowPrice: "80", highPrice: "680" } },
  });
  const facets = extractFacets(html);
  assert.equal(facets.price_min, 80);
  assert.equal(facets.price_max, 680);
});

test("JSON-LD：@graph 包一层也能找到 Event", () => {
  const html = page("", {
    jsonLd: { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, { "@type": "Event", name: "被包在 graph 里" }] },
  });
  assert.equal(extractJsonLdEvent(html)?.name, "被包在 graph 里");
});

test("JSON-LD：isAccessibleForFree 直接采信", () => {
  const html = page("", { jsonLd: { "@type": "Event", name: "x", isAccessibleForFree: true } });
  assert.equal(extractFacets(html).is_free, true);
});

test("JSON-LD 坏掉时退回正文正则，不影响其他字段", () => {
  const html = `<html><body><script type="application/ld+json">{ 坏掉的 json </script><p>票价：¥80-680</p></body></html>`;
  const facets = extractFacets(html);
  assert.equal(facets.has_json_ld_event, false);
  assert.equal(facets.price_min, 80);
  assert.equal(facets.price_max, 680);
});

test("价格：货币符号写法带区间", () => {
  assert.deepEqual(extractPrice("<p>票价 ¥80-680</p>"), { min: 80, max: 680 });
  assert.deepEqual(extractPrice("<p>￥120</p>"), { min: 120, max: 120 });
});

test("价格：多个「N 元」在票价上下文里取最小与最大", () => {
  const html = "<p>票价：180 / 280 / 380 元</p>";
  assert.deepEqual(extractPrice(html), { min: 180, max: 380 });
});

test("价格：80 元起", () => {
  assert.deepEqual(extractPrice("<p>门票 80 元起，售完为止</p>"), { min: 80, max: 80 });
});

test("价格：没有票价上下文的「元」不当成票价", () => {
  assert.deepEqual(extractPrice("<p>满 100 元包邮，时长 90 元? 不，是 90 分钟</p>"), { min: null, max: null });
});

test("地址：结构式（市+区+路+号）", () => {
  assert.equal(
    extractAddress("<p>演出地点：上海市黄浦区南京东路 100 号 3 楼</p>"),
    "上海市黄浦区南京东路 100 号",
  );
});

test("地址：「地址：」标签式，后面的营业时间被切掉", () => {
  assert.equal(
    extractAddress("<p>地址：西岸美术馆 B1 展厅；开放时间 10:00-18:00</p>"),
    "西岸美术馆 B1 展厅",
  );
});

test("地址：抓不到就返回空串", () => {
  assert.equal(extractAddress("<p>上海见</p>"), "");
});

test("免费：直接说免费入场", () => {
  assert.equal(extractFreeFlag("<p>免费入场，无需预约</p>"), true);
  assert.equal(extractFreeFlag("<p>免票</p>"), true);
});

test("免费：带人群限定的不算免费", () => {
  assert.equal(extractFreeFlag("<p>1.2 米以下儿童免费</p>"), false);
  assert.equal(extractFreeFlag("<p>会员免费，普通观众 50 元</p>"), false);
});

test("免费：免费停车 / 免费寄存这类服务不算活动免费", () => {
  assert.equal(extractFreeFlag("<p>现场提供免费停车</p>"), false);
});

test("免费：没提就是 null，不是 false", () => {
  assert.equal(extractFreeFlag("<p>票价 180 元</p>"), null);
});

test("四个字段都抓不到时全是空值，不猜", () => {
  const facets = extractFacets("<html><body><p>一场活动</p></body></html>");
  assert.equal(facets.address, "");
  assert.equal(facets.price_min, null);
  assert.equal(facets.price_max, null);
  assert.equal(facets.is_free, null);
  assert.deepEqual(facets.provenance, {});
});

test("toPlainText 去掉脚本与样式，保留句读", () => {
  const text = toPlainText("<style>a{}</style><p>第一句。</p><script>x=1</script><p>第二句。</p>");
  assert.equal(text.includes("a{}"), false);
  assert.equal(text.includes("x=1"), false);
  assert.match(text, /第一句。/);
  assert.match(text, /第二句。/);
});
