import { safeExternalUrl } from "../../lib/events.js";

export function CategoryEventCard({ event }) {
  const sourceLabel = formatSourceLabel(event);

  return (
    <a
      className="glass-card glass-event-card"
      href={safeExternalUrl(event.signup_url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="card-date">{formatDateTime(event.start_time)}</span>
      <strong className="card-title">{event.title}</strong>
      {event.summary ? <p className="card-summary">{event.summary}</p> : null}
      <small className="card-meta">
        {event.venue}
        {sourceLabel ? ` · ${sourceLabel}` : ""}
      </small>
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
