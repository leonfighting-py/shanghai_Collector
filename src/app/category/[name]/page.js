import Link from "next/link";

import { CategoryEventCard } from "../../components/CategoryEventCard.js";
import { CATEGORIES, toShanghaiDayWindow } from "../../../lib/events.js";
import { getCategoryEyebrow } from "../../../lib/home-view-model.js";
import { getDisplayTopPicks } from "../../../lib/recommendations.js";
import { listEvents } from "../../../lib/repository.js";

export default async function CategoryPage({ params, searchParams }) {
  const { name } = await params;
  const query = await searchParams;
  const category = decodeURIComponent(name);

  if (!CATEGORIES.includes(category)) {
    return (
      <main className="magazine-shell">
        <p>未找到该分类。</p>
        <Link className="section-more" href="/">
          返回首页
        </Link>
      </main>
    );
  }

  const anchor = query?.week || new Date().toISOString().slice(0, 10);
  const range = toShanghaiDayWindow(anchor);
  const rawEvents = await listEvents({ week: anchor, category });
  const events = getDisplayTopPicks(rawEvents, rawEvents.length, anchor);
  const eyebrow = getCategoryEyebrow(category);

  return (
    <main className="magazine-shell">
      <header className="browse-header">
        <Link className="browse-back" href="/">
          ← 返回首页
        </Link>
        <div className="section-label browse-label">
          <div>
            <span>{eyebrow}</span>
            <strong>{category}</strong>
          </div>
          <p className="browse-meta">
            {range.startDate} 至 {range.endDate} · 共 {events.length} 条
          </p>
        </div>
      </header>

      {events.length === 0 ? (
        <p className="browse-empty">该分类在当前时间窗口内暂无活动。</p>
      ) : (
        <div className="category-grid category-grid--browse">
          {events.map((event) => (
            <CategoryEventCard event={event} key={event.dedupe_key} />
          ))}
        </div>
      )}
    </main>
  );
}
