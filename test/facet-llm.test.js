import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFacetSuggestion,
  backfillFacetsWithLlm,
  getFacetLlmConfig,
  needsFacetHelp,
  validateFacetItem,
} from "../src/lib/facet-llm.js";

const EXCERPT =
  "上海民生现代美术馆 当前展览 塑我此生：贾科梅蒂艺术大展 地址：上海市黄浦区威海路48号 " +
  "票价：50-98元 展期 9月20日至12月7日 开放时间 10:00-18:00 周一闭馆 " +
  "免费人群：1.2米以下儿童 购票须知 请提前预约入场 现场不设售票窗口";

const event = (overrides = {}) => ({
  title: "塑我此生：贾科梅蒂艺术大展",
  venue: "上海",
  category: "展览",
  signup_url: "https://a.example.com/e/1",
  district: "",
  address: null,
  price_min: null,
  price_max: null,
  is_free: null,
  audience: [],
  ...overrides,
});

test("正文里能找到的字段全部采信", () => {
  const result = validateFacetItem(
    {
      district: "黄浦",
      address: "上海市黄浦区威海路48号",
      price_min: 50,
      price_max: 98,
      is_free: false,
      audience: ["亲子"],
    },
    EXCERPT,
  );

  assert.equal(result.district, "黄浦");
  assert.equal(result.address, "上海市黄浦区威海路48号");
  assert.equal(result.price_min, 50);
  assert.equal(result.price_max, 98);
  assert.equal(result.is_free, false);
  assert.deepEqual(result.audience, ["亲子"]);
  assert.deepEqual(result.rejected, []);
});

test("编造的价格被丢弃（正文里没有这个数字）", () => {
  const result = validateFacetItem({ price_min: 120, price_max: 300 }, EXCERPT);
  assert.equal(result.price_min, null);
  assert.equal(result.price_max, null);
  assert.ok(result.rejected.includes("price_min"));
  assert.ok(result.rejected.includes("price_max"));
});

test("名单外的区被丢弃", () => {
  assert.equal(validateFacetItem({ district: "苏州" }, EXCERPT).district, null);
  assert.equal(validateFacetItem({ district: "浦东新区" }, EXCERPT).district, null, "必须用短名");
  assert.deepEqual(validateFacetItem({ district: "苏州" }, EXCERPT).rejected, ["district"]);
});

test("名单外的人群标签被丢弃，合法标签留下", () => {
  const result = validateFacetItem({ audience: ["亲子", "学生", "银发", "遛娃"] }, EXCERPT);
  assert.deepEqual(result.audience, ["亲子", "学生"]);
});

test("说免费但正文没有免费字样 → 丢弃", () => {
  const result = validateFacetItem({ is_free: true }, "票价 180 元起，欢迎观展");
  assert.equal(result.is_free, null);
  assert.ok(result.rejected.includes("is_free"));

  const ok = validateFacetItem({ is_free: true }, "本展免费入场，无需预约");
  assert.equal(ok.is_free, true);
});

test("正文里拼不出来的地址被丢弃", () => {
  const result = validateFacetItem({ address: "上海市静安区南京西路1266号" }, EXCERPT);
  assert.equal(result.address, null);
  assert.ok(result.rejected.includes("address"));
});

test("价格区间反了 → 两个都丢", () => {
  const result = validateFacetItem({ price_min: 98, price_max: 50 }, EXCERPT);
  assert.equal(result.price_min, null);
  assert.equal(result.price_max, null);
  assert.ok(result.rejected.includes("price_range"));
});

test("只补空缺，不覆盖已有值", () => {
  const target = event({ address: "解析器给的地址", price_min: 100 });
  const { changed } = applyFacetSuggestion(target, {
    district: "黄浦",
    address: "模型给的地址",
    price_min: 50,
    price_max: 98,
    is_free: null,
    audience: [],
  });

  assert.equal(target.address, "解析器给的地址");
  assert.equal(target.price_min, 100);
  assert.equal(target.price_max, 98, "空缺的字段要补上");
  assert.equal(changed, true);
});

test("需要兜底的判断：缺区域 / 缺地址 / 没标签三者之一", () => {
  assert.equal(needsFacetHelp(event()), true);
  assert.equal(needsFacetHelp(event({ district: "黄浦", address: "x", audience: ["学生"] })), false);
  assert.equal(needsFacetHelp(event({ district: "黄浦", address: "", audience: ["学生"] })), true);
});

test("开关默认关；OpenAI 兼容配置缺失时也不开", () => {
  assert.equal(getFacetLlmConfig({}).enabled, false);
  assert.equal(getFacetLlmConfig({ LLM_FACETS_ENABLED: "true" }).enabled, false, "没有 API key 时不该开");
  assert.equal(
    getFacetLlmConfig({ LLM_FACETS_ENABLED: "true", SILICONFLOW_API_KEY: "k", LLM_ENRICHMENT_ENABLED: "true" }).enabled,
    true,
  );
});

test("关闭时一次模型都不调", async () => {
  let called = 0;
  const result = await backfillFacetsWithLlm([event()], {
    config: { enabled: false },
    excerpts: new Map([["https://a.example.com/e/1", EXCERPT]]),
    chat: async () => {
      called += 1;
      return { content: "{}" };
    },
  });

  assert.equal(called, 0);
  assert.equal(result.enabled, false);
});

test("开启时批量调用，校验通过的字段落到事件上", async () => {
  const target = event();
  const seen = [];
  const result = await backfillFacetsWithLlm([target], {
    config: { enabled: true, batchSize: 4, concurrency: 1, silicon: {} },
    excerpts: new Map([["https://a.example.com/e/1", EXCERPT]]),
    chat: async (request) => {
      seen.push(request);
      return {
        content: JSON.stringify({
          items: [
            {
              index: 1,
              district: "黄浦",
              address: "上海市黄浦区威海路48号",
              price_min: 50,
              price_max: 98,
              is_free: false,
              audience: ["亲子"],
            },
          ],
        }),
      };
    },
  });

  assert.equal(seen.length, 1);
  assert.equal(target.district, "黄浦");
  assert.equal(target.address, "上海市黄浦区威海路48号");
  assert.equal(target.price_min, 50);
  assert.equal(target.is_free, false);
  assert.deepEqual(target.audience, ["亲子"]);
  assert.equal(target.facet_provenance.district, "llm");
  assert.equal(target.facet_provenance.price, "llm");
  assert.equal(result.filled, 1);
  assert.equal(result.asked, 1);
});

test("正文太短不问模型", async () => {
  let called = 0;
  const result = await backfillFacetsWithLlm([event()], {
    config: { enabled: true, batchSize: 4, concurrency: 1, silicon: {} },
    excerpts: new Map([["https://a.example.com/e/1", "太短了"]]),
    chat: async () => {
      called += 1;
      return { content: "{}" };
    },
  });

  assert.equal(called, 0);
  assert.equal(result.asked, 0);
});
