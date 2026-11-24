import { EventBrowser } from "./components/EventBrowser.js";
import { EventImage } from "./components/EventImage.js";
import { HomeHero } from "./components/HomeHero.js";
import { eventEndDay, eventStartDay, formatDotDate, formatShanghaiClock, isMultiDay } from "../lib/agenda.js";
import { readClassificationParams } from "../lib/event-classify.js";
import { CATEGORIES, toShanghaiDate } from "../lib/events.js";
import { parseListParam } from "../lib/favorite-list.js";
import { buildHomeViewModel } from "../lib/home-view-model.js";
import { SCENE_KEYS, availableScenes } from "../lib/scenes.js";
import { venueCoordinate } from "../lib/venue-coordinates.js";
import { matchVenue } from "../lib/venue-profiles.js";
import { listEvents } from "../lib/repository.js";

// Override via NEXT_PUBLIC_HERO_VIDEO_URL in .env / .dev.vars
const HERO_VIDEO_URL =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL || "/media/shanghai-radar-loop.mp4?v=2";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 传给客户端的字段白名单：日程表只用得到这些，别把 raw_event_ids 等内部字段带下去
const CLIENT_FIELDS = [
  "title", "start_time", "end_time", "venue", "category", "subcategory", "district",
  "signup_url", "source_name", "summary", "image_url", "dedupe_key", "slug",
  // 场景卡要用：免费只认 is_free === true，带娃看 audience
  "is_free", "audience",
  // 地图要用：场馆的字典名（聚合键）与坐标。坐标由服务端从 venue-coordinates.js 取，
  // 不把 100 多条坐标打进浏览器包
  "venueKey", "coord",
];

export default async function Home({ searchParams }) {
  const params = await searchParams;
  // 默认锚点取上海日期（UTC 日期在 0-8 点会比上海晚一天）
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params?.week || "") ? params.week : toShanghaiDate(new Date());
  const search = typeof params?.search === "string" ? params.search.trim().slice(0, 100) : "";
  const category = CATEGORIES.includes(params?.category) ? params.category : "";
  // 细分与区域走白名单：乱填的参数会让列表静默筛成空，不如直接忽略（逻辑在 event-classify.js 里有单测）
  const { subcategory, district } = readClassificationParams(params, category);
  // 朋友分享的清单：只认合法 slug，乱写的片段丢掉（见 favorite-list.js）
  const sharedList = parseListParam(typeof params?.list === "string" ? params.list : "");

  // 类目和搜索都在客户端筛（切换零延迟），所以这里永远取整个窗口
  const events = await listEvents({ week: anchor });
  const view = buildHomeViewModel(events, { now: new Date(anchor) });
  const scenesNow = new Date();

  // 场馆字典只在服务端用：给每条活动标注「是否室内 / 是否认得这个场馆」，
  // 浏览器只拿到两个布尔值，不用把 100 多条场馆字典打进包里。
  const annotated = events.map((event) => {
    const profile = matchVenue(event.venue);
    return {
      ...event,
      indoor: profile ? profile.indoor === true : null,
      inDictionary: Boolean(profile),
      venueKey: profile ? profile.name : "",
      coord: profile ? venueCoordinate(profile.name) : null,
    };
  });
  // 场景卡：少于 3 条的不展示（放个点进去只有一条的空入口，比没有更糟）
  const scenes = availableScenes(annotated, scenesNow);
  const initialScene = SCENE_KEYS.includes(params?.scene) ? params.scene : "";

  const clientEvents = annotated.map((event) =>
    Object.fromEntries(
      [...CLIENT_FIELDS, "indoor", "inDictionary"].map((field) => [field, event[field] ?? null]),
    ),
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
                  key={event.slug}
                  href={`/e/${event.slug}`}
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
          scenes={scenes}
          initialScene={initialScene}
          sceneNow={scenesNow.toISOString()}
          today={view.today}
          days={view.windowDays}
          initialCategory={category}
          initialSubcategory={subcategory}
          initialDistrict={district}
          initialSearch={search}
          sharedList={sharedList}
        />

        <footer className="colophon">
          <span>数据每两日自动更新 · 来源均标注于每条活动</span>
          <span className="colophon-links">
            <a href="/calendar.ics">订阅日历</a>
            <a href="#top">回到顶部 ↑</a>
          </span>
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
