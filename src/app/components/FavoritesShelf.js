"use client";

import { useFavorites } from "./useFavorites.js";
import { safeExternalUrl } from "../../lib/events.js";
import { formatDateTime } from "./CategoryEventCard.js";

/**
 * 我的收藏：localStorage 中已收藏、且当前窗口内仍存在的活动。
 */
export function FavoritesShelf({ events }) {
  const { favorites, ready } = useFavorites();
  if (!ready || favorites.length === 0) return null;

  const saved = events.filter((event) => favorites.includes(event.dedupe_key));
  if (saved.length === 0) return null;

  return (
    <section className="favorites-shelf" aria-label="我的收藏">
      <div className="section-label">
        <div>
          <p className="eyebrow">SAVED</p>
          <span className="title">我的收藏 · {saved.length}</span>
        </div>
        <span className="section-count">星标的活动都在这里</span>
      </div>
      <div className="favorites-list">
        {saved.map((event) => (
          <a
            key={event.dedupe_key}
            className="favorite-pill"
            href={safeExternalUrl(event.signup_url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="favorite-date">{formatDateTime(event.start_time)}</span>
            <span className="favorite-title">{event.title}</span>
            <span className="favorite-venue">{event.venue}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
