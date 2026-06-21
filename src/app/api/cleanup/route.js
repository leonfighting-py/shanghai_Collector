import { NextResponse } from "next/server";

import { runCleanupJob } from "../../../lib/cleanup-job.js";

export async function POST(request) {
  const expected = process.env.COLLECT_SECRET;
  const provided = request.headers.get("x-collect-secret") || new URL(request.url).searchParams.get("secret");

  if (expected && provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runCleanupJob();

  return NextResponse.json(result);
}
