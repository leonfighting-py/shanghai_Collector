import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithRetry } from "../src/lib/fetch-html.js";

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
