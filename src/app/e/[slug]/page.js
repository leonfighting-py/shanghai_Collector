import { notFound } from "next/navigation";
import { cache } from "react";

import { EventImage } from "../../components/EventImage.js";
import {
  daysBetween,
  eventEndDay,
  eventStartDay,
  formatDotDate,
  formatShanghaiClock,
  isMultiDay,
  spanDays,
} from "../../../lib/agenda.js";
import { safeExternalUrl, toShanghaiDate, toShanghaiWeekRange } from "../../../lib/events.js";
import { listEvents } from "../../../lib/repository.js";
import { getSiteUrl } from "../../../lib/site-url.js";

// 数据每两日更新一次，详情页给 1 小时缓存就够；活动下线后最迟 1 小时变成「已结束」页
export const revalidate = 3600;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// generateMetadata 和页面正文都要这条活动。用 React 的 cache 做请求内去重，
// 不然一个详情页要打两次同样的窗口查询。
const findEventBySlug = cache(async (slug) => {
  // 口径与首页完全一致（同一个 listEvents 窗口）：slug 在 filterPublishableEvents 里派生，
  // 撞号时的 -2 后缀取决于同批数据里有哪些活动，用同一口径查才不会查到隔壁那条。
  // 一次查询同时供「查单条」和「相关推荐」用，不再单独发第二条。
  const events = await listEvents({});
  return { events, event: events.find((item) => item.slug === slug) || null };
});

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { event } = await findEventBySlug(slug);
  const base = getSiteUrl();

  if (!event) {
    return {
      title: "活动已结束 · 上海近两日活动精选",
      description: "这场活动已经结束或已移出当前两周窗口，回到首页看本周还有哪些活动。",
      alternates: { canonical: `${base}/` },
      robots: { index: false, follow: true },
    };
  }

  const when = formatWhen(event);
  const description = `${when} · ${event.venue}${event.summary ? ` — ${event.summary}` : ""}`.slice(0, 150);
  const cover = usableCover(event.image_url);

  return {
    title: `${event.title} · ${formatDotDate(eventStartDay(event))} · 上海`,
    description,
    alternates: { canonical: `${base}/e/${event.slug}` },
    openGraph: {
      type: "article",
      title: event.title,
      description,
      url: `${base}/e/${event.slug}`,
      siteName: "上海近两日活动精选",
      locale: "zh_CN",
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: { card: cover ? "summary_large_image" : "summary", title: event.title, description },
  };
}

export default async function EventDetail({ params }) {
  const { slug } = await params;
  const { events, event } = await findEventBySlug(slug);
  if (!event) notFound();

  const base = getSiteUrl();
  const startDay = eventStartDay(event);
  const relatedSameVenue = pickRelated(events, event, (other) => sameVenue(other, event)).slice(0, 3);
  const relatedSameWeek = pickRelated(events, event, (other) => sameWeek(other, event)).slice(0, 3);
  const signup = safeExternalUrl(event.signup_url);
  // 单日活动的时间已经在标题下面那行说完了，这里只给长档期补「进行到第几天 / 还剩几天」
  const progress = formatProgress(event);

  return (
    <main className="sheet detail">
      <a className="detail-back" href="/">
        ← 回到日程表
      </a>

      <header className="detail-head">
        <p className="eyebrow">
          {event.category}
          {event.subcategory ? ` · ${event.subcategory}` : ""}
          {event.district ? ` · ${event.district}` : ""}
        </p>
        <h1>{event.title}</h1>
        <p className="detail-when">{formatWhen(event)}</p>
      </header>

      {usableCover(event.image_url) ? (
        <div className="detail-cover">
          <EventImage url={event.image_url} width={1200} />
        </div>
      ) : null}

      <div className="detail-body">
        <div className="detail-main">
          <dl className="detail-facts">
            <div>
              <dt>场馆</dt>
              <dd>
                {event.venue}
                {event.district ? <small>{event.district}</small> : null}
              </dd>
            </div>
            {progress ? (
              <div>
                <dt>档期</dt>
                <dd>{progress}</dd>
              </div>
            ) : null}
            <div>
              <dt>来源</dt>
              <dd>
                <SourceList event={event} />
              </dd>
            </div>
          </dl>

          {event.summary ? <p className="detail-summary">{event.summary}</p> : null}

          <div className="detail-actions">
            <a className="btn-primary" href={signup} target="_blank" rel="noopener noreferrer">
              去报名 ↗
            </a>
            <a className="btn-ghost" href="/#agenda">
              看同一周的其它活动
            </a>
          </div>

          <p className="detail-note">
            时间与报名信息摘自上列来源，以来源页面为准。本站只做汇总，不代办报名。
          </p>
        </div>
      </div>

      {relatedSameVenue.length > 0 ? (
        <RelatedSection title="同场馆" caption={`${event.venue} 还有这些`} events={relatedSameVenue} />
      ) : null}
      {relatedSameWeek.length > 0 ? (
        <RelatedSection
          title="同一周"
          caption={`${formatDotDate(weekOf(startDay).startDate)} — ${formatDotDate(weekOf(startDay).endDate)} 这周还能去`}
          events={relatedSameWeek}
        />
      ) : null}

      <footer className="colophon">
        <span>数据每两日自动更新 · 来源均标注于每条活动</span>
        <a href="/">回到首页 ↑</a>
      </footer>

      {/* JSON-LD：让搜索结果能出活动富卡片。只放页面上也有的字段，不补编造的开始/结束。 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(event, base)) }}
      />
    </main>
  );
}

function RelatedSection({ title, caption, events }) {
  return (
    <section className="related" aria-label={title}>
      <div className="sec-head">
        <h2>{title}</h2>
        <span>{caption}</span>
      </div>
      <div className="picks">
        {events.map((event) => (
          <a className="pick" key={event.slug} href={`/e/${event.slug}`}>
            <span className="cover" data-label={event.category}>
              <EventImage url={event.image_url} width={800} />
            </span>
            <span className="pick-no">{formatDotDate(eventStartDay(event))} · {event.category}</span>
            <strong>{event.title}</strong>
            <small>{event.venue}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function SourceList({ event }) {
  const sources = Array.isArray(event.sources) && event.sources.length > 0
    ? event.sources
    : [{ name: event.source_name, url: event.source_url }];
  return (
    <>
      {sources
        .filter((source) => source?.name && source?.url)
        .map((source) => (
          <a
            key={`${source.name}|${source.url}`}
            href={safeExternalUrl(source.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.name} ↗
          </a>
        ))}
    </>
  );
}

/** 单日：11.20 周五 19:00；跨天：11.10 — 11.17 · 共 8 天（开场 19:30） */
function formatWhen(event) {
  const start = eventStartDay(event);
  if (!start) return "";
  if (isMultiDay(event)) {
    return `${formatDotDate(start)} — ${formatDotDate(eventEndDay(event))} · 共 ${spanDays(event)} 天`;
  }
  const weekday = WEEKDAYS[new Date(`${start}T00:00:00Z`).getUTCDay()];
  const clock = formatShanghaiClock(event.start_time);
  return `${formatDotDate(start)} ${weekday}${clock ? ` ${clock}` : ""}`;
}

/** 长档期的进度文案；单日活动返回空串（时间在标题下面已经说清楚了） */
function formatProgress(event) {
  if (!isMultiDay(event)) return "";
  const today = toShanghaiDate(new Date());
  const start = eventStartDay(event);
  const end = eventEndDay(event);
  if (end < today) return "已结束";
  if (today < start) return `${formatDotDate(start)} 开始 · 共 ${spanDays(event)} 天`;
  return `已进行第 ${daysBetween(start, today) + 1} 天 · 还剩 ${daysBetween(today, end)} 天`;
}

function sameVenue(left, right) {
  return left.venue && right.venue && left.venue.trim() === right.venue.trim();
}

/** 「同一周」按开始日所在的那一周（周一至周日）判定；跨周的长档期两边都算 */
function weekOf(day) {
  return toShanghaiWeekRange(new Date(`${day}T04:00:00Z`));
}

function sameWeek(left, right) {
  const week = weekOf(eventStartDay(right));
  return eventStartDay(left) <= week.endDate && eventEndDay(left) >= week.startDate;
}

function pickRelated(events, event, predicate) {
  return events
    .filter((other) => other.slug !== event.slug && predicate(other))
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}

function usableCover(url) {
  const text = String(url || "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
}

function buildJsonLd(event, base) {
  const url = `${base}/e/${event.slug}`;
  const cover = usableCover(event.image_url);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.start_time,
    ...(event.end_time ? { endDate: event.end_time } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue,
      ...(event.district ? { address: { "@type": "PostalAddress", addressLocality: "上海", streetAddress: event.district } } : {}),
    },
    ...(cover ? { image: [cover] } : {}),
    ...(event.summary ? { description: event.summary } : {}),
    url,
    ...(safeExternalUrl(event.signup_url) !== "#" ? { offers: { "@type": "Offer", url: event.signup_url } } : {}),
  };
}
