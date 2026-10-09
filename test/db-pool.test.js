import test from "node:test";
import assert from "node:assert/strict";

import {
  DB_RETRY_ATTEMPTS,
  acquireWithRetry,
  isReadOnlyStatement,
  isRetryableConnectionError,
  runQuery,
  runStatementWithRetry,
  runTransaction,
} from "../src/lib/db-pool.js";

// 测试里把退避和重试日志都关掉，别让单测真的睡 1s / 3s。
const silent = { sleep: async () => {}, onRetry: () => {} };

function connectionError(message = "Connection terminated unexpectedly", code) {
  const error = new Error(message);
  if (code) error.code = code;
  return error;
}

// 按剧本回放一个假 pool：每一步要么「拿连接失败」，要么给一条「发语句失败」的连接。
function scriptedPool(steps) {
  const state = { connects: 0, releases: [] };
  return {
    state,
    async connect() {
      const step = steps[state.connects];
      state.connects += 1;
      if (!step || step.connectError) {
        throw step ? step.connectError : new Error("剧本用完了，不该再拿连接");
      }
      return {
        async query() {
          if (step.queryError) throw step.queryError;
          return step.result || { rows: [], rowCount: 0 };
        },
        release(error) {
          state.releases.push(error);
        },
      };
    },
  };
}

test("连接类错误才可重试，SQL 错误不重试", () => {
  assert.equal(isRetryableConnectionError(connectionError()), true);
  assert.equal(isRetryableConnectionError(connectionError("read ECONNRESET", "ECONNRESET")), true);
  assert.equal(isRetryableConnectionError(connectionError("timeout exceeded when trying to connect", "ETIMEDOUT")), true);
  assert.equal(isRetryableConnectionError(connectionError('relation "events" does not exist', "42P01")), false);
  assert.equal(isRetryableConnectionError(connectionError("password authentication failed for user", "28P01")), false);
  assert.equal(isRetryableConnectionError(null), false);
});

test("只读语句判定覆盖换行、大小写与 WITH", () => {
  assert.equal(isReadOnlyStatement("select 1"), true);
  assert.equal(isReadOnlyStatement("\n      select title from events"), true);
  assert.equal(isReadOnlyStatement("WITH x AS (select 1) select * from x"), true);
  assert.equal(isReadOnlyStatement("insert into raw_events default values"), false);
  assert.equal(isReadOnlyStatement("update collection_runs set status = $1"), false);
  assert.equal(isReadOnlyStatement("delete from events"), false);
});

test("拿连接失败会重试，写语句也敢重试（语句从未发出）", async () => {
  const pool = scriptedPool([
    { connectError: connectionError() },
    { connectError: connectionError("timeout exceeded when trying to connect", "ETIMEDOUT") },
    { result: { rows: [{ id: 7 }], rowCount: 1 } },
  ]);

  const result = await runStatementWithRetry(
    pool,
    "insert into collection_runs (source_count) values ($1) returning id",
    [1],
    silent,
  );

  assert.deepEqual(result.rows, [{ id: 7 }]);
  assert.equal(pool.state.connects, 3);
});

test("拿连接连续失败到上限就抛错，不无限重试", async () => {
  const pool = scriptedPool([
    { connectError: connectionError() },
    { connectError: connectionError() },
    { connectError: connectionError() },
    { connectError: connectionError() },
  ]);

  await assert.rejects(() => acquireWithRetry(pool, silent), /Connection terminated unexpectedly/);
  assert.equal(pool.state.connects, DB_RETRY_ATTEMPTS);
});

test("非连接类错误不重试", async () => {
  const pool = scriptedPool([
    { connectError: connectionError('password authentication failed for user "postgres"', "28P01") },
  ]);

  await assert.rejects(() => runStatementWithRetry(pool, "select 1", [], silent), /password authentication failed/);
  assert.equal(pool.state.connects, 1);
});

test("只读语句在发语句后断连会重试，并把坏连接丢弃", async () => {
  const pool = scriptedPool([{ queryError: connectionError() }, { result: { rows: [{ n: 1 }], rowCount: 1 } }]);

  const result = await runStatementWithRetry(pool, "select count(*) as n from events", [], silent);

  assert.deepEqual(result.rows, [{ n: 1 }]);
  assert.equal(pool.state.connects, 2);
  // 第一次：坏连接带 error 丢弃；第二次：重试成功的连接干净归还。
  assert.equal(pool.state.releases.length, 2);
  assert.match(pool.state.releases[0].message, /Connection terminated unexpectedly/);
  assert.equal(pool.state.releases[1], undefined);
});

test("写语句在发语句后断连不重试（无法判断服务端是否已执行）", async () => {
  const pool = scriptedPool([{ queryError: connectionError() }, { result: { rows: [] } }]);

  await assert.rejects(
    () => runStatementWithRetry(pool, "insert into raw_events (title) values ($1)", ["x"], silent),
    /Connection terminated unexpectedly/,
  );
  assert.equal(pool.state.connects, 1);
});

test("只是 SQL 报错时把连接归还，不丢弃", async () => {
  const pool = scriptedPool([{ queryError: connectionError('relation "events" does not exist', "42P01") }]);

  await assert.rejects(() => runStatementWithRetry(pool, "select * from events", [], silent), /does not exist/);
  assert.equal(pool.state.connects, 1);
  assert.equal(pool.state.releases.length, 1);
  assert.equal(pool.state.releases[0], undefined);
});

test("缺 DATABASE_URL 时 runQuery / runTransaction 仍然直接抛错", async () => {
  await assert.rejects(() => runQuery("select 1", [], {}), /DATABASE_URL is required/);
  await assert.rejects(() => runTransaction([], {}), /DATABASE_URL is required/);
});
