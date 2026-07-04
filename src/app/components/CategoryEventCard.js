export function CategoryEventCard({ event }) {
  const sourceLabel = formatSourceLabel(event);

  return (
    <a className="category-card" href={event.signup_url}>
      <span>{formatDateTime(event.start_time)}</span>
      <strong>{event.title}</strong>
      {event.summary ? <p className="event-summary">{event.summary}</p> : null}
      <small>
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
