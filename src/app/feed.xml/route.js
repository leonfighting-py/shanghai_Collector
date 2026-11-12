import { CATEGORIES, toShanghaiDate } from "../../lib/events.js";
import { listEvents } from "../../lib/repository.js";
import { getSiteUrl } from "../../lib/site-url.js";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRssDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;

  if (category && !CATEGORIES.includes(category)) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<error>invalid category; allowed: ${CATEGORIES.join(", ")}</error>`,
      { status: 400, headers: { "Content-Type": "application/xml; charset=utf-8" } },
    );
  }

  const events = await listEvents({ category });
  const base = getSiteUrl();
  const channelTitle = category ? `上海${category}活动精选` : "上海近两日活动精选";

  const items = events
    .map((event) => {
      const sourceLine = event.source_name ? `来源：${event.source_name}` : "";
      const venueLine = event.venue ? `地点：${event.venue}` : "";
      const dateLine = `日期：${toShanghaiDate(event.start_time)}${event.end_time ? ` 至 ${toShanghaiDate(event.end_time)}` : ""}`;
      const description = [dateLine, venueLine, sourceLine, event.summary || ""].filter(Boolean).join("\n");
      const guid = event.dedupe_key || `${event.source_url}|${event.title}`;
      return [
        "    <item>",
        `      <title>${escapeXml(event.title)}</title>`,
        `      <link>${escapeXml(event.signup_url || event.source_url || base)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(guid)}</guid>`,
        `      <pubDate>${formatRssDate(event.start_time)}</pubDate>`,
        `      <description><![CDATA[${description}]]></description>`,
        event.category ? `      <category>${escapeXml(event.category)}</category>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(base)}</link>
    <description>每两日自动聚合上海未来两周的演出、展览、线下活动与高校公开讲座。</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(base)}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600",
    },
  });
}
