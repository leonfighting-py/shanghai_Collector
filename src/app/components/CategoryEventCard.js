export function CategoryEventCard({ event }) {
  return (
    <a className="category-card" href={event.signup_url}>
      <span>{formatDateTime(event.start_time)}</span>
      <strong>{event.title}</strong>
      <small>
        {event.venue}
        {event.source_name ? ` · ${event.source_name}` : ""}
      </small>
    </a>
  );
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
