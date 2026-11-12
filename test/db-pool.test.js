import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

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

// 假连接。继承 EventEmitter 是必须的：真实 pg.Client 就是 EventEmitter，
// 而「语句在途时连接被对端关掉」这条故障正是通过 client 上的 error 事件传递的。
class FakeClient extends EventEmitter {
  constructor(step, state) {
    super();
    this.step = step;
    this.state = state;
  }

  query() {
    const step = this.step;
    return new Promise((resolve, reject) => {
      // 复刻真实时序（pg/lib/client.js 的 con.once('end') → _handleErrorEvent）：
      // 先同步 reject 在途查询，再在同一个同步块里 emit('error')；两者都发生在
      // 「已经不在调用栈里」的时刻 —— 此时连接仍处于已租出状态。
      process.nextTick(() => {
        if (step.emitErrorOnQuery) this.emit("error", step.emitErrorOnQuery);
        if (step.queryError) reject(step.queryError);
        else resolve(step.result || { rows: [], rowCount: 0 });
      });
    });
  }

  release(error) {
    this.state.releases.push(error);
  }
}

// 按剧本回放一个假 pool：每一步要么「拿连接失败」，要么给一条「发语句失败」的连接。
function scriptedPool(steps) {
  const state = { connects: 0, releases: [], clients: [] };
  return {
    state,
    async connect() {
      const step = steps[state.connects];
      state.connects += 1;
      if (!step || step.connectError) {
        throw step ? step.connectError : new Error("剧本用完了，不该再拿连接");
      }
      const client = new FakeClient(step, state);
      state.clients.push(client);
      return client;
    },
  };
}

test("连接类错误才可重试，SQL 错误不重试", () => {
  assert.equal(isRetryableConnectionError(connectionError()), true);
  assert.equal(isRetryableConnectionError(connectionError("read ECONNRESET", "ECONNRESET")), true);
  assert.equal(isRetryableConnectionError(connectionError("timeout exceeded when trying to connect", "ETIMEDOUT")), true);
  // pg 的查询级读超时没有 code，只有这句 message（pg/lib/client.js 的 new Error('Query read timeout')）。
  // 不认它的话，加了 query_timeout 反而会变成「快速硬失败」，一次都不重试。
  assert.equal(isRetryableConnectionError(connectionError("Query read timeout")), true);
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
  // 剧本按 DB_RETRY_ATTEMPTS 生成：次数一变，这条测试不会因为「剧本用完」假红。
  const pool = scriptedPool(Array.from({ length: DB_RETRY_ATTEMPTS }, () => ({ connectError: connectionError() })));

  await assert.rejects(() => acquireWithRetry(pool, silent), /Connection terminated unexpectedly/);
  assert.equal(pool.state.connects, DB_RETRY_ATTEMPTS);
});

test("查询级读超时按连接故障处理：只读语句重试，坏连接被丢弃", async () => {
  const pool = scriptedPool([
    { queryError: connectionError("Query read timeout") },
    { result: { rows: [{ n: 1 }], rowCount: 1 } },
  ]);

  const result = await runStatementWithRetry(pool, "select count(*) as n from events", [], silent);

  assert.deepEqual(result.rows, [{ n: 1 }]);
  assert.equal(pool.state.connects, 2);
  assert.match(pool.state.releases[0].message, /Query read timeout/);
  assert.equal(pool.state.releases[1], undefined);
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

// 复刻 2026-10-11 线上事故（跑的是含退避重试的 43539c2，日志里一条 [db] 重试都没有，
// 崩溃信息是 Emitted 'error' event on Client instance）：
// pg-pool 租出连接时会摘掉自己的 error 监听，此时在途连接被对端关掉就会变成
// Unhandled 'error' event，整个进程退出、下面这些重试分支一行都跑不到。
test("语句在途时连接被对端关掉：进程不崩，只读语句照常重试", async () => {
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const pool = scriptedPool([
      { emitErrorOnQuery: connectionError(), queryError: connectionError() },
      { result: { rows: [{ n: 1 }], rowCount: 1 } },
    ]);

    const result = await runStatementWithRetry(pool, "select count(*) as n from events", [], silent);

    assert.deepEqual(result.rows, [{ n: 1 }]);
    assert.equal(pool.state.connects, 2);
    // 坏连接带 error 丢弃，重试成功的连接干净归还
    assert.match(pool.state.releases[0].message, /Connection terminated unexpectedly/);
    assert.equal(pool.state.releases[1], undefined);
    // 租用期的 error 事件被兜住，并留下一条日志（不是静默吞掉）
    assert.equal(logged.length, 1);
    assert.match(logged[0], /租用期间被对端关闭/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("语句在途时连接被对端关掉：写语句不重试，也不把进程带崩", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const pool = scriptedPool([{ emitErrorOnQuery: connectionError(), queryError: connectionError() }]);

    await assert.rejects(
      () => runStatementWithRetry(pool, "insert into raw_events (title) values ($1)", ["x"], silent),
      /Connection terminated unexpectedly/,
    );
    assert.equal(pool.state.connects, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test("租用结束后不在连接上留下 error 监听", async () => {
  const pool = scriptedPool([{ result: { rows: [], rowCount: 0 } }]);

  await runStatementWithRetry(pool, "select 1", [], silent);

  assert.equal(pool.state.clients.length, 1);
  assert.equal(pool.state.clients[0].listenerCount("error"), 0);
});

test("缺 DATABASE_URL 时 runQuery / runTransaction 仍然直接抛错", async () => {
  await assert.rejects(() => runQuery("select 1", [], {}), /DATABASE_URL is required/);
  await assert.rejects(() => runTransaction([], {}), /DATABASE_URL is required/);
});
