import { DISTRICTS } from "../../lib/event-classify.js";
import { CATEGORIES } from "../../lib/events.js";
import { buildCalendar } from "../../lib/ical.js";
import { listEvents } from "../../lib/repository.js";
import { getSiteUrl } from "../../lib/site-url.js";

/** 收藏导出一次最多 100 条：超出多半是把整站塞进 URL，直接拒绝比生成巨型文件好 */
const MAX_SLUGS = 100;
const SLUG_RE = /^[0-9a-z]{10}(-\d+)?$/;

function badRequest(message) {
  return new Response(`${message}\n`, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * 日历订阅源：/calendar.ics
 *
 *   /calendar.ics                       全站（未来两周）
 *   /calendar.ics?category=展览          按类目
 *   /calendar.ics?district=徐汇          按区域
 *   /calendar.ics?slugs=a,b,c           收藏清单导出（最多 100 条）
 *
 * 和 feed.xml 一样做白名单校验：乱填参数直接 400，而不是静默返回全站内容。
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "";
  const district = searchParams.get("district") || "";
  const slugsRaw = searchParams.get("slugs") || "";

  if (category && !CATEGORIES.includes(category)) {
    return badRequest(`invalid category; allowed: ${CATEGORIES.join(", ")}`);
  }
  if (district && !DISTRICTS.includes(district)) {
    return badRequest(`invalid district; allowed: ${DISTRICTS.join(", ")}`);
  }

  const slugs = slugsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (slugs.length > MAX_SLUGS) {
    return badRequest(`too many slugs; at most ${MAX_SLUGS}`);
  }
  const invalidSlug = slugs.find((item) => !SLUG_RE.test(item));
  if (invalidSlug) {
    return badRequest(`invalid slug: ${invalidSlug}`);
  }

  const events = await listEvents({ category: category || undefined });

  let selected = events;
  // 区域是派生字段（event-classify.js），SQL 里没有这列，只能取回来再筛
  if (district) selected = selected.filter((event) => event.district === district);
  if (slugs.length > 0) {
    const wanted = new Set(slugs);
    selected = selected.filter((event) => wanted.has(event.slug));
  }

  // 订阅后日历 App 里显示的名字，跟着筛选条件走
  const calendarName =
    district && category
      ? `上海${district}${category}`
      : district
        ? `上海${district}活动`
        : category
          ? `上海${category}精选`
          : "上海近两日活动";

  const body = buildCalendar(selected, { siteUrl: getSiteUrl(), calendarName });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // 订阅源不加 Content-Disposition：加了浏览器只会下载，日历 App 就订不上了
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600",
    },
  });
}
