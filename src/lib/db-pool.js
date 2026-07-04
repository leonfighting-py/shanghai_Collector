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
