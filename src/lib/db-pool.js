import pg from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

export async function runQuery(sqlText, params = [], env = process.env) {
  const config = getDatabaseConfig(env);
  if (!config) {
    throw new Error("DATABASE_URL is required");
  }

  if (config.maxUses === 1) {
    const pool = new pg.Pool(config);
    try {
      return await pool.query(sqlText, params);
    } finally {
      await pool.end().catch(() => {});
    }
  }

  if (!runQuery.localPool) {
    runQuery.localPool = new pg.Pool({
      connectionString: config.connectionString,
      ssl: config.ssl,
    });
  }

  return runQuery.localPool.query(sqlText, params);
}

/**
 * 在同一个连接上执行事务：租借单个 client，保证 BEGIN/COMMIT 不跨连接
 * （Hyperdrive 场景下 runQuery 每次新建 maxUses:1 的池，BEGIN..COMMIT 会散落到不同连接）。
 */
export async function runTransaction(statements, env = process.env) {
  const config = getDatabaseConfig(env);
  if (!config) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new pg.Pool({ connectionString: config.connectionString, ssl: config.ssl, max: 1 });
  const client = await pool.connect();
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
