import { NextResponse } from "next/server";

import { CATEGORIES } from "../../../lib/events.js";
import { listEvents } from "../../../lib/repository.js";

// 公开响应 DTO：不泄漏 raw_event_ids 等内部字段
const PUBLIC_FIELDS = [
  "title",
  "start_time",
  "end_time",
  "venue",
  "category",
  "signup_url",
  "source_name",
  "source_url",
  "sources",
  "summary",
];

function toPublicEvent(event) {
  const publicEvent = {};
  for (const field of PUBLIC_FIELDS) {
    if (event[field] !== undefined) publicEvent[field] = event[field];
  }
  return publicEvent;
}

function validateParams({ week, category, search }) {
  if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) return "week must be YYYY-MM-DD";
  if (category && !CATEGORIES.includes(category)) return `category must be one of: ${CATEGORIES.join(", ")}`;
  if (search && search.length > 100) return "search must be at most 100 characters";
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const params = {
    week: searchParams.get("week") || undefined,
    category: searchParams.get("category") || undefined,
    search: searchParams.get("search") || undefined,
  };

  const invalid = validateParams(params);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const events = await listEvents(params);

  return NextResponse.json(
    {
      events: events.map(toPublicEvent),
      count: events.length,
      generated_at: new Date().toISOString(),
    },
    // 数据每两日更新，公共读路径允许 CDN/浏览器短缓存
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600" } },
  );
}
