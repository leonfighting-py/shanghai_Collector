import { NextResponse } from "next/server";

import { cleanupOldData } from "../../../lib/repository.js";

export async function POST(request) {
  const expected = process.env.COLLECT_SECRET;
  const provided = request.headers.get("x-collect-secret") || new URL(request.url).searchParams.get("secret");

  if (expected && provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await cleanupOldData({ eventRetentionDays: 60, runRetentionDays: 90 });

  return NextResponse.json({
    ok: true,
    retention: {
      events_days: 60,
      runs_days: 90,
    },
    ...result,
  });
}
