import Link from "next/link";

import { CategoryEventCard } from "./components/CategoryEventCard.js";
import { toShanghaiDayWindow } from "../lib/events.js";
import { buildHomeViewModel } from "../lib/home-view-model.js";
import { listEvents } from "../lib/repository.js";
import { FeaturedCarousel } from "./FeaturedCarousel.js";

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const anchor = params?.week || new Date().toISOString().slice(0, 10);
  const range = toShanghaiDayWindow(anchor);
  const events = await listEvents({ week: anchor });
  const view = buildHomeViewModel(events, { now: new Date(anchor) });

  return (
    <main className="magazine-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Shanghai Two-Week Radar</p>
          <h1>上海未来两周活动精选</h1>
        </div>
        <div className="issue-mark">
          <span>{view.updatedLabel}</span>
          <strong>{view.updatedDate}</strong>
          <small>
            {view.windowLabel} · {events.length} events
          </small>
        </div>
      </header>

      <FeaturedCarousel events={view.featuredEvents} />

      <section className="category-stack" aria-label={`${range.startDate} 至 ${range.endDate} 分类精选`}>
        {view.categorySections.map((section) => (
          <CategorySection section={section} key={section.title} />
        ))}
      </section>
    </main>
  );
}

function CategorySection({ section }) {
  const hasMore = section.totalCount > section.events.length;

  return (
    <section className="category-section">
      <div className="section-label">
        <div>
          <span>{section.eyebrow}</span>
          <strong>{section.title}</strong>
        </div>
        {hasMore ? (
          <Link className="section-more" href={section.browseHref}>
            查看更多 · 共 {section.totalCount} 条
          </Link>
        ) : (
          <span className="section-count">共 {section.totalCount} 条</span>
        )}
      </div>
      <div className="category-grid">
        {section.events.map((event) => (
          <CategoryEventCard event={event} key={`${section.title}-${event.dedupe_key}`} />
        ))}
      </div>
    </section>
  );
}
