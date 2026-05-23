import { NextResponse } from "next/server";

import { listEvents } from "../../../lib/repository.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const events = await listEvents({
    week: searchParams.get("week") || undefined,
    category: searchParams.get("category") || undefined,
    search: searchParams.get("search") || undefined,
  });

  return NextResponse.json({
    events,
    count: events.length,
    generated_at: new Date().toISOString(),
  });
}

