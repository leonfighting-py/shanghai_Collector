"use client";

import { safeExternalUrl } from "../../lib/events.js";
import { useFavorites } from "./useFavorites.js";

export function CategoryEventCard({ event }) {
  const sourceLabel = formatSourceLabel(event);
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(event.dedupe_key);
  const image = event.image_url && /^https?:\/\//i.test(event.image_url) ? event.image_url : null;

  return (
    <a
      className={`glass-card glass-event-card ${image ? "has-image" : ""}`}
      href={safeExternalUrl(event.signup_url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {image ? (
        <span className="card-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </span>
      ) : null}
      <span className="card-body">
        <span className="card-date">{formatDateTime(event.start_time)}</span>
        <strong className="card-title">{event.title}</strong>
        {event.summary ? <p className="card-summary">{event.summary}</p> : null}
        <small className="card-meta">
          {event.venue}
          {sourceLabel ? ` · ${sourceLabel}` : ""}
        </small>
      </span>
      <button
        type="button"
        className={`card-favorite ${favorite ? "is-active" : ""}`}
        aria-label={favorite ? "取消收藏" : "收藏活动"}
        aria-pressed={favorite}
        onClick={(clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          toggleFavorite(event.dedupe_key);
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M12 3.6l2.47 5.01 5.53.8-4 3.9.94 5.5L12 16.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L12 3.6z"
            fill={favorite ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </a>
  );
}

function formatSourceLabel(event) {
  const source = String(event.source_name || "").trim();
  const venue = String(event.venue || "").trim();
  if (!source) return "";
  if (source === venue) return "";
  if (venue.includes(source) || source.includes(venue)) return "";
  return source;
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
