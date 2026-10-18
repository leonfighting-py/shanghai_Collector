import test from "node:test";
import assert from "node:assert/strict";

import {
  configureOutboundProxy,
  describeOutboundProxy,
  resetOutboundProxy,
  resolveDispatcher,
} from "../src/lib/proxy-registry.js";
import { defaultFetchHtml, fetchWithRetry } from "../src/lib/fetch-html.js";
import { initOutboundProxy } from "../src/lib/outbound-proxy.js";

const fakeAgent = { name: "fake-agent" };
const createAgent = () => fakeAgent;

test("出口代理：未配置时 resolveDispatcher 恒为 undefined（保持直连）", () => {
  resetOutboundProxy();
  assert.equal(resolveDispatcher("https://www.eventbrite.com/d/china--shanghai/"), undefined);
  assert.equal(describeOutboundProxy(), "disabled");
});

test("出口代理：不设白名单时所有域名都走代理", () => {
  resetOutboundProxy();
  configureOutboundProxy({ proxyUrl: "http://127.0.0.1:7890", createAgent });
  assert.equal(resolveDispatcher("https://www.eventbrite.com/"), fakeAgent);
  assert.equal(resolveDispatcher("https://www.douban.com/"), fakeAgent);
  assert.match(describeOutboundProxy(), /all/);
});

test("出口代理：设了白名单只让匹配域名走代理（含子域，不含后缀伪装）", () => {
  resetOutboundProxy();
  configureOutboundProxy({
    proxyUrl: "http://127.0.0.1:7890",
    hosts: ["eventbrite.com", "meetup.com"],
    createAgent,
  });
  assert.equal(resolveDispatcher("https://www.eventbrite.com/d/x"), fakeAgent);
  assert.equal(resolveDispatcher("https://api.meetup.com/x"), fakeAgent);
  // 国内源必须直连，否则会被同一条代理线路拖慢甚至封
  assert.equal(resolveDispatcher("https://www.douban.com/"), undefined);
  // 不能把 noteventbrite.com 当成 eventbrite.com 的子域
  assert.equal(resolveDispatcher("https://noteventbrite.com/"), undefined);
});

test("出口代理：非法 URL 不会抛错，按直连处理", () => {
  resetOutboundProxy();
  configureOutboundProxy({ proxyUrl: "http://127.0.0.1:7890", hosts: ["eventbrite.com"], createAgent });
  assert.equal(resolveDispatcher("not a url"), undefined);
});

test("出口代理：dispatcher 会透传到 fetch 参数里", async () => {
  let seen;
  const response = await fetchWithRetry("https://example.com/", {
    retries: 0,
    dispatcher: fakeAgent,
    fetchImpl: async (_url, options) => {
      seen = options;
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => "" };
    },
  });
  assert.equal(response.status, 404);
  assert.equal(seen.dispatcher, fakeAgent);
});

test("出口代理：defaultFetchHtml 用的是登记表里的 dispatcher", async () => {
  resetOutboundProxy();
  configureOutboundProxy({ proxyUrl: "http://127.0.0.1:7890", createAgent });
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = options;
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
  };
  try {
    await assert.rejects(defaultFetchHtml("https://www.eventbrite.com/d/china--shanghai/"), /HTTP 404/);
  } finally {
    globalThis.fetch = originalFetch;
    resetOutboundProxy();
  }
  assert.equal(captured.dispatcher, fakeAgent);
});

test("出口代理：没设 OUTBOUND_PROXY 时初始化直接返回 disabled，不加载 undici", async () => {
  const original = process.env.OUTBOUND_PROXY;
  delete process.env.OUTBOUND_PROXY;
  try {
    assert.equal(await initOutboundProxy(), "disabled");
  } finally {
    if (original !== undefined) process.env.OUTBOUND_PROXY = original;
  }
});
