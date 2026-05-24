import { FeaturedCarousel } from "./FeaturedCarousel.js";
import { toShanghaiWeekRange } from "../lib/events.js";
import { buildHomeViewModel } from "../lib/home-view-model.js";
import { listEvents } from "../lib/repository.js";

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const week = params?.week || new Date().toISOString().slice(0, 10);
  const range = toShanghaiWeekRange(week);
  const events = await listEvents({ week });
  const view = buildHomeViewModel(events, { now: new Date() });

  return (
    <main className="magazine-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Shanghai Weekly</p>
          <h1>上海每周外出活动精选</h1>
        </div>
        <div className="issue-mark">
          <span>{view.updatedLabel}</span>
          <strong>{view.updatedDate}</strong>
          <small>{events.length} events found</small>
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
  return (
    <section className="category-section">
      <div className="section-label">
        <span>{section.eyebrow}</span>
        <strong>{section.title}</strong>
      </div>
      <div className="category-grid">
        {section.events.map((event) => (
          <a className="category-card" href={event.signup_url} key={`${section.title}-${event.dedupe_key}`}>
            <span>{formatDateTime(event.start_time)}</span>
            <strong>{event.title}</strong>
            <small>{event.venue}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
