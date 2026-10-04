"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildAgenda,
  daysBetween,
  eventEndDay,
  formatDotDate,
  formatRange,
  formatShanghaiClock,
  isMultiDay,
  splitByToday,
} from "../../lib/agenda.js";
import { CATEGORIES, safeExternalUrl } from "../../lib/events.js";
import { EventImage } from "./EventImage.js";
import { useFavorites } from "./useFavorites.js";

/** 每天默认展开的「当天开始 / 结束」行数，其余折叠到「展开当日其余」 */
const DAY_ROW_LIMIT = 5;
const RAIL_LIMIT = 14;

/**
 * 首页主体：「正在进行」海报栏 + 吸顶筛选条 + 按天分组的日程表。
 * 服务端一次给足整个两周窗口，类目 / 搜索 / 只看收藏都在这里本地筛，切换零延迟。
 */
export function EventBrowser({ events, today, days, initialCategory = "", initialSearch = "" }) {
  const [category, setCategory] = useState(initialCategory);
  const [search, setSearch] = useState(initialSearch);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  // 展开状态以 "more:<date>" / "run:<date>" 为键
  const [expanded, setExpanded] = useState({});
  const { favorites, isFavorite, toggleFavorite } = useFavorites();

  // 把筛选状态写回地址栏，方便分享；不走路由跳转，避免重新请求
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (category) params.set("category", category);
    else params.delete("category");
    if (search.trim()) params.set("search", search.trim());
    else params.delete("search");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [category, search]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const event of events) counts[event.category] = (counts[event.category] || 0) + 1;
    return counts;
  }, [events]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return events.filter((event) => {
      if (category && event.category !== category) return false;
      if (onlyFavorites && !favorites.includes(event.dedupe_key)) return false;
      if (!keyword) return true;
      return [event.title, event.venue, event.summary, event.source_name].some((text) =>
        String(text || "").toLowerCase().includes(keyword),
      );
    });
  }, [events, category, search, onlyFavorites, favorites]);

  const ongoing = useMemo(() => splitByToday(filtered, today).ongoing, [filtered, today]);
  const agenda = useMemo(() => buildAgenda(filtered, { today, days }), [filtered, today, days]);
  const visibleDays = agenda.filter((day) => day.rows.length > 0);
  const busiest = Math.max(1, ...agenda.map((day) => day.startCount + day.endCount));
  const toggle = (key) => setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <>
      {ongoing.length > 0 ? (
        <section aria-label="正在进行">
          <div className="sec-head">
            <h2>正在进行</h2>
            <span>开展中的展览与长档期演出 · {ongoing.length} 场</span>
          </div>
          <div className="rail">
            {ongoing.slice(0, RAIL_LIMIT).map((event) => (
              <a
                className="poster"
                key={event.dedupe_key}
                href={safeExternalUrl(event.signup_url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="cover" data-label={event.category}>
                  <EventImage url={event.image_url} width={400} />
                </span>
                <strong>{event.title}</strong>
                <small><em>至 {formatDotDate(eventEndDay(event))}</em> · {event.venue}</small>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="filters" id="agenda">
        <div className="filters-line">
          <div className="tabs" role="group" aria-label="分类筛选">
            <button type="button" className="tab" aria-pressed={!category} onClick={() => setCategory("")}>
              全部<sup>{events.length}</sup>
            </button>
            {CATEGORIES.map((name) => (
              <button
                type="button"
                className="tab"
                key={name}
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                {name}<sup>{categoryCounts[name] || 0}</sup>
              </button>
            ))}
          </div>
          <div className="tools">
            <label className="search">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={search}
                placeholder="搜索活动 / 场馆"
                aria-label="搜索活动"
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="fav-toggle"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites((value) => !value)}
            >
              {onlyFavorites ? "★" : "☆"} 收藏{favorites.length ? ` ${favorites.length}` : ""}
            </button>
          </div>
        </div>
        <nav className="days" aria-label="按日期跳转">
          {agenda.map((day) => {
            const count = day.startCount + day.endCount;
            const empty = day.rows.length === 0;
            return (
              <a
                key={day.date}
                href={empty ? undefined : `#day-${day.date}`}
                className={`day-chip${day.isToday ? " is-today" : ""}${day.isWeekend ? " is-weekend" : ""}${empty ? " is-empty" : ""}`}
              >
                <small>{day.weekday}</small>
                <b>{day.day}</b>
                {/* 粗线 = 当天开始/结束的场次多少；细线 = 当天有展期中的活动 */}
                <i style={{ width: `${Math.round((count / busiest) * 80)}%` }} />
                {day.runningCount > 0 ? <i className="is-running" /> : null}
              </a>
            );
          })}
        </nav>
      </div>

      {visibleDays.length === 0 ? (
        <p className="empty">
          {onlyFavorites ? "还没有收藏的活动，点活动右侧的星标即可收藏。" : "没有匹配的活动，试试换个关键词或分类。"}
        </p>
      ) : (
        visibleDays.map((day) => {
          const own = day.rows.filter((row) => row.kind !== "run");
          const featured = day.rows.filter((row) => row.kind === "run");
          const showAll = expanded[`more:${day.date}`];
          const shownOwn = showAll ? own : own.slice(0, DAY_ROW_LIMIT);
          const runOpen = expanded[`run:${day.date}`];

          return (
            <section className={`day${day.isToday ? " is-today" : ""}`} id={`day-${day.date}`} key={day.date}>
              <header className="day-side">
                <p className="day-num">{day.day}</p>
                <p className="day-week">{day.weekday}{day.isToday ? " · 今天" : ""}</p>
                <p className="day-meta">
                  {day.month} 月 · {day.startCount ? `${day.startCount} 场开始` : "无新开场"}
                  {day.endCount ? ` · ${day.endCount} 场收官` : ""}
                  {day.runningCount ? <span>{day.runningCount} 场展期中</span> : null}
                </p>
              </header>
              <div className="day-rows">
                {[...shownOwn, ...featured].map(({ event, kind }) => (
                  <AgendaRow
                    key={`${kind}-${event.dedupe_key}`}
                    event={event}
                    kind={kind}
                    date={day.date}
                    favorite={isFavorite(event.dedupe_key)}
                    onToggleFavorite={() => toggleFavorite(event.dedupe_key)}
                  />
                ))}
                {own.length > DAY_ROW_LIMIT ? (
                  <button type="button" className="fold" onClick={() => toggle(`more:${day.date}`)}>
                    <span>{showAll ? "收起" : `展开当日其余 ${own.length - DAY_ROW_LIMIT} 场`}</span>
                    <span aria-hidden="true">{showAll ? "↑" : "↓"}</span>
                  </button>
                ) : null}
                {day.folded.length > 0 ? (
                  <>
                    <button type="button" className="fold" aria-expanded={Boolean(runOpen)} onClick={() => toggle(`run:${day.date}`)}>
                      <span>展期中 · 另有 {day.folded.length} 场今天也能去</span>
                      <span aria-hidden="true">{runOpen ? "收起 ↑" : "展开 ↓"}</span>
                    </button>
                    {runOpen ? (
                      <div className="run-list">
                        {day.folded.map((event) => (
                          <a
                            className="run-item"
                            key={event.dedupe_key}
                            href={safeExternalUrl(event.signup_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span>{event.title}</span>
                            <span>至 {formatDotDate(eventEndDay(event))}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function AgendaRow({ event, kind, date, favorite, onToggleFavorite }) {
  const source = formatSourceLabel(event);
  const range =
    kind === "run"
      ? `至 ${formatDotDate(eventEndDay(event))} · 还剩 ${daysBetween(date, eventEndDay(event))} 天`
      : formatRange(event);

  return (
    <a
      className={`row${kind === "start" ? "" : " is-span"}`}
      href={safeExternalUrl(event.signup_url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="row-time">
        {kind === "last" ? "最后一天" : kind === "run" ? "展期中" : formatShanghaiClock(event.start_time)}
        {kind === "start" && isMultiDay(event) ? <small>首日</small> : null}
      </span>
      <span className="row-main">
        <strong>{event.title}</strong>
        <small>
          {range ? <em>{range}</em> : null}
          {event.venue}
          {source ? ` · ${source}` : ""}
        </small>
      </span>
      <span className="row-cat">{event.category}</span>
      <span className="row-thumb">
        <EventImage url={event.image_url} width={240} />
      </span>
      <button
        type="button"
        className="star"
        aria-label={favorite ? "取消收藏" : "收藏活动"}
        aria-pressed={favorite}
        onClick={(clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          onToggleFavorite();
        }}
      >
        {favorite ? "★" : "☆"}
      </button>
    </a>
  );
}

/** 来源与场馆同名（场馆官网自己发的）时不重复显示 */
function formatSourceLabel(event) {
  const source = String(event.source_name || "").trim();
  const venue = String(event.venue || "").trim();
  if (!source || source === venue) return "";
  if (venue.includes(source) || source.includes(venue)) return "";
  return source;
}
