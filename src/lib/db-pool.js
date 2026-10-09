import pg from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// 连接级故障的重试上限（含首次尝试）。
// 2026-10-09 事故：采集第一句 listEvents 就撞上 Supabase pooler 主动断开
// （`Connection terminated unexpectedly`，见 pg/lib/client.js 的 con.once('end')），
// 整个采集进程以未捕获异常退出、整轮白跑。
// 判据：10-05 / 10-08 / 10-09 三次报错行号完全一致，且 10-08 那次 06:12 失败、
// 06:18 重跑即成功 → 这是瞬时抖动，重试能救，不是代码缺陷。
export const DB_RETRY_ATTEMPTS = 3;
// 第 n 次失败后的等待毫秒数（超出数组长度就沿用最后一个值）。
export const DB_RETRY_BACKOFF_MS = [1000, 3000];
// 建立连接的超时。pg 默认 0 = 永远等；实测被 pooler 挂住时能拖到 ~117 秒才报错。
export const DB_CONNECT_TIMEOUT_MS = 15_000;
// 空闲连接 10 秒后回收，避免拿着一条已经被 pooler 关掉的连接去发语句。
export const DB_IDLE_TIMEOUT_MS = 10_000;

// 「连接没了」而不是「SQL 有问题」的错误集合。SQL 报错（如 42601 语法错）不该重试。
const CONNECTION_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);
const CONNECTION_ERROR_PATTERN =
  /connection terminated|connection ended|server closed the connection|client has encountered a connection error|terminating connection due to administrator command/i;

export function isRetryableConnectionError(error) {
  if (!error) return false;
  const code = error.code ? String(error.code).toUpperCase() : "";
  if (CONNECTION_ERROR_CODES.has(code)) return true;
  return CONNECTION_ERROR_PATTERN.test(String(error.message || ""));
}

// 只有只读语句允许在「语句已经发出之后」重试 —— 写语句此时无法判断服务端是否已经执行，
// 重试可能写出重复行，所以宁可让它失败。
export function isReadOnlyStatement(sqlText) {
  return /^\s*(select|with|show|explain|values)\b/i.test(String(sqlText ?? ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffFor(backoff, attempt) {
  if (!Array.isArray(backoff) || backoff.length === 0) return 0;
  return backoff[Math.min(attempt - 1, backoff.length - 1)];
}

function retryPolicy(options = {}) {
  const attempts =
    Number.isFinite(options.attempts) && options.attempts > 0 ? Math.floor(options.attempts) : DB_RETRY_ATTEMPTS;
  return {
    attempts,
    backoff: options.backoff || DB_RETRY_BACKOFF_MS,
    sleepImpl: options.sleep || sleep,
    onRetry:
      options.onRetry ||
      (({ phase, attempt, error }) => {
        const phaseLabel = phase === "connect" ? "建立连接" : "执行语句";
        console.error(`[db] ${phaseLabel}失败，第 ${attempt} 次重试：${error?.message || error}`);
      }),
  };
}

// 池里空闲连接被对端切断时 pg-pool 会 emit('error')；没有监听器就是未捕获异常，
// 会把整个采集进程直接带崩 —— 必须挂一个，把连接池自身的报错降级成日志。
function attachPoolErrorLogger(pool, label) {
  pool.on("error", (error) => {
    console.error(`[db]${label} 连接池报了连接错误（该连接已被移除，后续查询会自动重建）：${error?.message || error}`);
  });
}

function databaseSsl(connectionString) {
  if (
    connectionString.includes("render.com") ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com")
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getDatabaseConfig(env = process.env) {
  try {
    const { env: cfEnv } = getCloudflareContext();
    if (cfEnv?.HYPERDRIVE?.connectionString) {
      return {
        connectionString: cfEnv.HYPERDRIVE.connectionString,
        maxUses: 1,
      };
    }
  } catch {
    // Local Node scripts and non-Cloudflare runtimes.
  }

  if (!env.DATABASE_URL) return null;

  return {
    connectionString: env.DATABASE_URL,
    ssl: databaseSsl(env.DATABASE_URL),
  };
}

// 拿一条连接，连接级故障时退避重试。
// 这一步失败意味着「语句从未发出」，所以写语句也敢重试。
export async function acquireWithRetry(pool, options = {}) {
  const { attempts, backoff, sleepImpl, onRetry } = retryPolicy(options);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await pool.connect();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableConnectionError(error)) throw error;
      onRetry({ phase: "connect", attempt, error });
      await sleepImpl(backoffFor(backoff, attempt));
    }
  }

  throw lastError;
}

// 显式拆开 pg 的 pool.query 内部「拿连接」与「发语句」两步，才能区分两类失败：
//   · 拿连接失败 → 语句从未发出 → 重试永远安全（写语句也一样）
//   · 发语句之后失败 → 只有只读语句能安全重试，写语句原样抛错
// （pool.query 把两步揉在一起，报错时无法区分，这是 10-09 事故里整轮采集被一句话掐死的原因之一。）
export async function runStatementWithRetry(pool, sqlText, params = [], options = {}) {
  const { attempts, backoff, sleepImpl, onRetry } = retryPolicy(options);
  const readOnly = isReadOnlyStatement(sqlText);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let client;
    try {
      client = await pool.connect();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableConnectionError(error)) throw error;
      onRetry({ phase: "connect", attempt, error });
      await sleepImpl(backoffFor(backoff, attempt));
      continue;
    }

    try {
      const result = await client.query(sqlText, params);
      client.release();
      return result;
    } catch (error) {
      const connectionBroken = isRetryableConnectionError(error);
      // 连接坏了就丢弃（别放回池里给下一条语句用）；只是 SQL 报错就把连接归还。
      client.release(connectionBroken ? error : undefined);
      lastError = error;
      if (attempt >= attempts || !connectionBroken || !readOnly) throw error;
      onRetry({ phase: "query", attempt, error });
      await sleepImpl(backoffFor(backoff, attempt));
    }
  }

  throw lastError;
}

function getLocalPool(config) {
  if (!runQuery.localPool) {
    runQuery.localPool = new pg.Pool({
      connectionString: config.connectionString,
      ssl: config.ssl,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    });
    attachPoolErrorLogger(runQuery.localPool, "");
  }
  return runQuery.localPool;
}

export async function runQuery(sqlText, params = [], env = process.env) {
  const config = getDatabaseConfig(env);
  if (!config) {
    throw new Error("DATABASE_URL is required");
  }

  if (config.maxUses === 1) {
    // Hyperdrive：每次调用新建一个 maxUses:1 的池，用完即关。
    const pool = new pg.Pool({
      connectionString: config.connectionString,
      ssl: config.ssl,
      maxUses: 1,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    });
    attachPoolErrorLogger(pool, "（Hyperdrive）");
    try {
      return await runStatementWithRetry(pool, sqlText, params);
    } finally {
      await pool.end().catch(() => {});
    }
  }

  return runStatementWithRetry(getLocalPool(config), sqlText, params);
}

/**
 * 在同一个连接上执行事务：租借单个 client，保证 BEGIN/COMMIT 不跨连接
 * （Hyperdrive 场景下 runQuery 每次新建 maxUses:1 的池，BEGIN..COMMIT 会散落到不同连接）。
 *
 * 只对「拿连接」重试：事务内某条语句失败后状态未知，靠 rollback 收尾并原样抛出，
 * 不在这里重跑整个事务（重跑会重复 DELETE/INSERT）。
 */
export async function runTransaction(statements, env = process.env) {
  const config = getDatabaseConfig(env);
  if (!config) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new pg.Pool({
    connectionString: config.connectionString,
    ssl: config.ssl,
    max: 1,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
  });
  attachPoolErrorLogger(pool, "（事务）");

  const client = await acquireWithRetry(pool);
  try {
    await client.query("begin");
    const results = [];
    for (const statement of statements) {
      results.push(await client.query(statement.sql, statement.params || []));
    }
    await client.query("commit");
    return results;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}
