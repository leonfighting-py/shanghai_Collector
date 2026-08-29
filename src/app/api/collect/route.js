import { NextResponse } from "next/server";

import { runCollectJob } from "../../../lib/collect-job.js";

export async function POST(request) {
  const expected = process.env.COLLECT_SECRET;
  if (!expected) {
    // fail-closed：未配置密钥时拒绝执行，避免线上接口被匿名触发采集
    return NextResponse.json({ error: "collect secret not configured" }, { status: 403 });
  }

  const provided = request.headers.get("x-collect-secret") || new URL(request.url).searchParams.get("secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runCollectJob();

  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
