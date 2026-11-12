import { redirect } from "next/navigation";

import { CATEGORIES } from "../../../lib/events.js";

// 类目页已并入首页日程表的类目 Tab；保留这个路由只为让旧链接（搜索引擎、分享出去的 URL）继续可用。
export default async function CategoryPage({ params, searchParams }) {
  const { name } = await params;
  const query = await searchParams;
  const category = decodeURIComponent(name);

  const next = new URLSearchParams();
  if (CATEGORIES.includes(category)) next.set("category", category);
  if (typeof query?.week === "string") next.set("week", query.week);
  const suffix = next.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}
