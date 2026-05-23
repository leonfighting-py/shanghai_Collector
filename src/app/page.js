import { CATEGORIES, toShanghaiWeekRange } from "../lib/events.js";
import { listEvents } from "../lib/repository.js";
import { getCategoryFeatures, getHeroEvent, getTonightEvents, getTopPicks, getWeekendEvents } from "../lib/recommendations.js";

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const week = params?.week || new Date().toISOString().slice(0, 10);
  const range = toShanghaiWeekRange(week);
  const events = await listEvents({ week });
  const heroEvent = getHeroEvent(events, `${range.startDate}T12:00:00+08:00`);
  const topPicks = getTopPicks(events, 8, `${range.startDate}T12:00:00+08:00`).filter(
    (event) => event.dedupe_key !== heroEvent?.dedupe_key,
  );
  const categoryFeatures = getCategoryFeatures(events, `${range.startDate}T12:00:00+08:00`);
  const tonightEvents = getTonightEvents(events, `${range.startDate}T12:00:00+08:00`);
  const weekendEvents = getWeekendEvents(events, `${range.startDate}T12:00:00+08:00`);

  return (
    <main className="magazine-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Shanghai Cultural Weekly</p>
          <h1>上海本周文化精选</h1>
        </div>
        <div className="issue-mark">
          <span>Issue</span>
          <strong>{range.startDate.slice(5).replace("-", "/")}</strong>
          <small>{events.length} events found</small>
        </div>
      </header>

      <section className="cover-grid">
        {heroEvent && (
          <a className="cover-story" href={heroEvent.signup_url}>
            <span className="cover-kicker">{heroEvent.category}</span>
            <h2>{heroEvent.title}</h2>
            <p>{heroEvent.venue} / {formatDateTime(heroEvent.start_time)}</p>
            <em>Editor's first pick for the week</em>
          </a>
        )}

        <aside className="cover-note">
          <p>本周从公开活动源中挑出少量值得先看的内容。完整活动库后续放到二级页，首页只保留推荐和策展。</p>
          <a href="/events" className="quiet-link">查看完整活动库</a>
        </aside>
      </section>

      <section className="top-picks">
        <div className="section-label">
          <span>Top Picks</span>
          <strong>本周先看这几项</strong>
        </div>
        <div className="pick-grid">
          {topPicks.slice(0, 6).map((event, index) => (
            <a className="pick-card" href={event.signup_url} key={event.dedupe_key}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{event.title}</h3>
              <p>{formatDateTime(event.start_time)} / {event.venue}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="feature-row">
        {CATEGORIES.map((category) => {
          const event = categoryFeatures[category];
          if (!event) return null;
          return (
            <a className="feature-card" href={event.signup_url} key={category}>
              <span>{category}</span>
              <h3>{event.title}</h3>
              <p>{event.venue}</p>
            </a>
          );
        })}
      </section>

      <section className="shelves">
        <Shelf title="今晚可去" events={tonightEvents} />
        <Shelf title="周末慢逛" events={weekendEvents} />
      </section>
    </main>
  );
}

function Shelf({ title, events }) {
  return (
    <div className="shelf">
      <div className="section-label compact">
        <span>Curated Shelf</span>
        <strong>{title}</strong>
      </div>
      <div className="shelf-list">
        {events.slice(0, 4).map((event) => (
          <a href={event.signup_url} key={`${title}-${event.dedupe_key}`}>
            <span>{formatDateTime(event.start_time)}</span>
            <strong>{event.title}</strong>
            <small>{event.venue}</small>
          </a>
        ))}
        {events.length === 0 && <p className="empty">本周暂无推荐。</p>}
      </div>
    </div>
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
