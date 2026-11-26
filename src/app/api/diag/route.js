import { NextResponse } from "next/server";

import { runQuery } from "../../../lib/db-pool.js";

export const dynamic = "force-dynamic";

// 临时诊断端点：确认线上 Worker 连的是哪个库、能不能读 issues。用完即删。
export async function GET() {
  const info = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasHyperdrive: Boolean(process.env.HYPERDRIVE || globalThis.__cf_env?.HYPERDRIVE),
  };
  try {
    const env = await runQuery("select current_database() as db, current_user as who");
    info.db = env.rows[0];
    const counts = await runQuery(
      "select (select count(*) from events) as events, (select count(*) from issues) as issues",
    );
    info.counts = counts.rows[0];
    const row = await runQuery("select to_char(issue_date,'YYYY-MM-DD') as d from issues order by issue_date desc limit 3");
    info.dates = row.rows.map((r) => r.d);
  } catch (error) {
    info.error = String(error?.message || error).slice(0, 200);
    info.code = error?.code;
  }
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
