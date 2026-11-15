import { buildCalendar } from "../../../../lib/ical.js";
import { listEvents } from "../../../../lib/repository.js";
import { getSiteUrl } from "../../../../lib/site-url.js";

/**
 * 单条活动的日历文件：/e/{slug}/event.ics
 *
 * 查法与详情页完全一致（同一个 listEvents 窗口），因为 slug 是派生字段、表里没有列。
 */
export async function GET(request, { params }) {
  const { slug } = await params;

  const events = await listEvents({});
  const event = events.find((item) => item.slug === slug);

  if (!event) {
    return new Response("活动已结束或不存在\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = buildCalendar([event], { siteUrl: getSiteUrl() });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // 单条下载：给个文件名，避免浏览器存成 event.ics 互相覆盖
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600",
    },
  });
}
