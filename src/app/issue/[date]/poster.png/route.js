import { getIssue } from "../../../../lib/issues.js";

export const dynamic = "force-dynamic";

// 海报是 CI 渲染好放在 GitHub Release 上的（1080×1920 PNG）。
// Workers 里跑不了 satori + 中文字体，所以这里只做「确认这一期存在 → 302 过去」。
const POSTER_BASE =
  process.env.POSTER_BASE_URL ||
  "https://github.com/leonfighting-py/shanghai_Collector/releases/download";

export async function GET(request, { params }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response("not found", { status: 404 });
  }

  // 先确认这一期在归档里，避免把乱写的日期也重定向出去
  const issue = await getIssue(date);
  if (!issue) return new Response("not found", { status: 404 });

  const url = `${POSTER_BASE}/issue-poster-${date}/poster-${date}.png`;
  // 海报一期内不会变；确认资源存在后再重定向，缺图时给 404 而不是让用户看到 GitHub 的报错页
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) {
    return new Response("poster not ready", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "public, max-age=600" },
  });
}
