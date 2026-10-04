import { EventBrowser } from "./components/EventBrowser.js";
import { EventImage } from "./components/EventImage.js";
import { HomeHero } from "./components/HomeHero.js";
import { eventEndDay, eventStartDay, formatDotDate, formatShanghaiClock, isMultiDay } from "../lib/agenda.js";
import { CATEGORIES, safeExternalUrl, toShanghaiDate } from "../lib/events.js";
import { buildHomeViewModel } from "../lib/home-view-model.js";
import { listEvents } from "../lib/repository.js";

// Override via NEXT_PUBLIC_HERO_VIDEO_URL in .env / .dev.vars
const HERO_VIDEO_URL =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL || "/media/shanghai-radar-loop.mp4?v=2";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 传给客户端的字段白名单：日程表只用得到这些，别把 raw_event_ids 等内部字段带下去
const CLIENT_FIELDS = [
  "title", "start_time", "end_time", "venue", "category",
  "signup_url", "source_name", "summary", "image_url", "dedupe_key",
];

export default async function Home({ searchParams }) {
  const params = await searchParams;
  // 默认锚点取上海日期（UTC 日期在 0-8 点会比上海晚一天）
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params?.week || "") ? params.week : toShanghaiDate(new Date());
  const search = typeof params?.search === "string" ? params.search.trim().slice(0, 100) : "";
  const category = CATEGORIES.includes(params?.category) ? params.category : "";

  // 类目和搜索都在客户端筛（切换零延迟），所以这里永远取整个窗口
  const events = await listEvents({ week: anchor });
  const view = buildHomeViewModel(events, { now: new Date(anchor) });
  const clientEvents = events.map((event) =>
    Object.fromEntries(CLIENT_FIELDS.map((field) => [field, event[field] ?? null])),
  );

  return (
    <div id="top">
      <HomeHero videoUrl={HERO_VIDEO_URL} />

      <main className="sheet" id="city-discoveries">
        <div className="issue-strip">
          <p className="eyebrow">本期 · {view.issueLabel}</p>
          <dl className="stats">
            <div><dt>{view.stats.upcoming}</dt><dd>场即将开始</dd></div>
            <div><dt>{view.stats.ongoing}</dt><dd>场正在进行</dd></div>
            <div><dt>{view.stats.venues}</dt><dd>个场馆</dd></div>
          </dl>
        </div>

        {view.highlights.length > 0 ? (
          <section aria-label="本期推荐">
            <div className="sec-head">
              <h2>本期推荐</h2>
              <span>编辑精选 · {view.highlights.length} 场</span>
            </div>
            <div className="picks">
              {view.highlights.map((event, index) => (
                <a
                  className="pick"
                  key={event.dedupe_key}
                  href={safeExternalUrl(event.signup_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="cover" data-label={event.category}>
                    <EventImage url={event.image_url} width={800} />
                  </span>
                  <span className="pick-no">N° 0{index + 1} · {event.category}</span>
                  <strong>{event.title}</strong>
                  <small>{formatHighlightTime(event)} · {event.venue}</small>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <EventBrowser
          events={clientEvents}
          today={view.today}
          days={view.windowDays}
          initialCategory={category}
          initialSearch={search}
        />

        <footer className="colophon">
          <span>数据每两日自动更新 · 来源均标注于每条活动</span>
          <a href="#top">回到顶部 ↑</a>
        </footer>
      </main>
    </div>
  );
}

function formatHighlightTime(event) {
  if (isMultiDay(event)) {
    return `${formatDotDate(eventStartDay(event))} — ${formatDotDate(eventEndDay(event))}`;
  }
  const day = eventStartDay(event);
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${formatDotDate(day)} ${weekday} ${formatShanghaiClock(event.start_time)}`;
}
