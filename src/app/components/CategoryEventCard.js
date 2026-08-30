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
      className="glass-card glass-event-card has-image"
      href={safeExternalUrl(event.signup_url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {image ? (
        <span className="card-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </span>
      ) : (
        <span className={`card-cover card-cover--fallback cover-${fallbackVariant(event)}`} aria-hidden="true">
          <span className="cover-glyph">{event.category}</span>
        </span>
      )}
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

/** 无图兜底：按 dedupe_key 哈希选渐变变体（0-3），避免所有卡片同角度 */
function fallbackVariant(event) {
  const key = event.dedupe_key || event.title || "x";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 4;
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
