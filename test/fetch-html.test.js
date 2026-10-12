import test from "node:test";
import assert from "node:assert/strict";

import { decodeHtmlBytes, defaultFetchHtml, fetchWithRetry, parseContentTypeCharset } from "../src/lib/fetch-html.js";

const noopSleep = async () => {};
const okResponse = () => ({ ok: true, status: 200, text: async () => "ok" });
const statusResponse = (status) => ({ ok: status >= 200 && status < 300, status, text: async () => "body" });

function sequencedFetch(responses) {
  let i = 0;
  const calls = [];
  const fetchImpl = async () => {
    calls.push(i);
    const item = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (typeof item === "function") return item();
    if (item instanceof Error) throw item;
    return item;
  };
  return { fetchImpl, calls };
}

test("retry: succeeds on the second attempt after a transient 503", async () => {
  const { fetchImpl, calls } = sequencedFetch([statusResponse(503), okResponse()]);
  const response = await fetchWithRetry("https://example.test", { fetchImpl, sleepImpl: noopSleep });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test("retry: a stable 503 exhausts retries then returns the last response (caller judges ok)", async () => {
  const { fetchImpl, calls } = sequencedFetch([statusResponse(503)]);
  const response = await fetchWithRetry("https://example.test", { fetchImpl, retries: 2, sleepImpl: noopSleep });
  assert.equal(response.status, 503);
  assert.equal(calls.length, 3, "初试 + 2 次重试");
});

test("retry: 404 is not retried (stable client error) and returns immediately", async () => {
  const { fetchImpl, calls } = sequencedFetch([statusResponse(404)]);
  const response = await fetchWithRetry("https://example.test", { fetchImpl, sleepImpl: noopSleep });
  assert.equal(response.status, 404);
  assert.equal(calls.length, 1, "4xx 不应重试");
});

test("retry: 429 is treated as retryable", async () => {
  const { fetchImpl, calls } = sequencedFetch([statusResponse(429), okResponse()]);
  const response = await fetchWithRetry("https://example.test", { fetchImpl, sleepImpl: noopSleep });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test("retry: network error (TypeError) is retried then succeeds", async () => {
  const { fetchImpl, calls } = sequencedFetch([new TypeError("fetch failed"), okResponse()]);
  const response = await fetchWithRetry("https://example.test", { fetchImpl, sleepImpl: noopSleep });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test("retry: non-retryable thrown error is not retried", async () => {
  const { fetchImpl, calls } = sequencedFetch([new Error("boom")]);
  await assert.rejects(
    () => fetchWithRetry("https://example.test", { fetchImpl, sleepImpl: noopSleep }),
    (error) => /boom/.test(error.message),
  );
  assert.equal(calls.length, 1);
});

// 「西安交通大学」的 GBK 字节。UTF-8 解会得到 ������ͨ��ѧ —— 2026-10-11 线上
// 西交讲座源的标题就是这个形状（Node 的 response.text() 只按 UTF-8 解）。
const GBK_SAMPLE = Uint8Array.from([206, 247, 176, 178, 189, 187, 205, 168, 180, 243, 209, 167]);
const EXPECTED = "西安交通大学";

test("charset: 从 Content-Type 提取 charset（带引号 / 大小写 / 无 charset）", () => {
  assert.equal(parseContentTypeCharset("text/html;charset=gbk"), "gbk");
  assert.equal(parseContentTypeCharset('text/html; charset="GB2312"'), "gb2312");
  assert.equal(parseContentTypeCharset("text/html; charset=UTF-8"), "utf-8");
  assert.equal(parseContentTypeCharset("text/html"), "");
  assert.equal(parseContentTypeCharset(null), "");
});

test("charset: 响应头声明优先于页内 meta（西交大页面 meta 写的是 UTF-8，是错的）", () => {
  const html = Buffer.concat([
    Buffer.from('<html><head><meta charset="UTF-8"><title>'),
    Buffer.from(GBK_SAMPLE),
    Buffer.from("</title></head></html>"),
  ]);

  assert.equal(decodeHtmlBytes(new Uint8Array(html), "text/html;charset=gbk").includes(EXPECTED), true);
  // 对照组：忽略响应头、只信 meta 就会解成乱码 —— 这正是修之前的行为
  assert.equal(decodeHtmlBytes(new Uint8Array(html), "").includes(EXPECTED), false);
});

test("charset: 响应头没声明时按页内 meta 解", () => {
  const html = Buffer.concat([
    Buffer.from('<html><head><meta http-equiv="Content-Type" content="text/html; charset=gbk"><title>'),
    Buffer.from(GBK_SAMPLE),
  ]);

  assert.equal(decodeHtmlBytes(new Uint8Array(html), "text/html").includes(EXPECTED), true);
});

test("charset: 任何地方都没声明时按 UTF-8 解", () => {
  const utf8 = new TextEncoder().encode(`<html><title>${EXPECTED}</title></html>`);
  assert.equal(decodeHtmlBytes(utf8, "text/html").includes(EXPECTED), true);
});

test("charset: 认不出的编码标签退回 UTF-8，不抛错", () => {
  const utf8 = new TextEncoder().encode(EXPECTED);
  assert.equal(decodeHtmlBytes(utf8, "text/html;charset=x-nonsense-enc"), EXPECTED);
});

test("defaultFetchHtml: 按声明编码返回文本（不是 UTF-8 硬解）", async () => {
  const body = Buffer.concat([Buffer.from("<title>"), Buffer.from(GBK_SAMPLE), Buffer.from("</title>")]);
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return new Response(body, { headers: { "content-type": "text/html;charset=gbk" } });
  };
  try {
    const html = await defaultFetchHtml("https://example.test/lecture");
    assert.equal(requested.length, 1);
    assert.equal(html.includes(EXPECTED), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
