import { isInDateRange, toShanghaiDayWindow } from "../events.js";
import { defaultFetchJson } from "../fetch-html.js";
import { buildEvent } from "./shared.js";

const NYU_JSON_URLS = [
  "https://events.shanghai.nyu.edu/live/json/events/group_id/all",
  "https://events.shanghai.nyu.edu/live/json/events",
];

export async function parseNyuShanghai(_html, source, { fetchJson = defaultFetchJson, now = new Date(), window } = {}) {
  const { startDate, endDate } = window || toShanghaiDayWindow(now);

  for (const url of NYU_JSON_URLS) {
    try {
      const payload = await fetchJson(url);
      const events = extractLivewhaleEvents(payload, source, { startDate, endDate });
      if (events.length > 0) return events;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

function extractLivewhaleEvents(payload, source, { startDate, endDate }) {
  const rows = Array.isArray(payload) ? payload : Object.values(payload || {}).filter((row) => row && typeof row === "object");

  return rows
    .map((row) => {
      const title = row.title || row.summary;
      const start = row.date_utc || row.date_iso || row.date || row.start;
      const venue = row.location || row.location_title || row.venue || "NYU Shanghai";
      const link = row.url || row.link || row.event_url || source.url;
      return buildEvent({ title, start_time: start, venue, signup_url: link, source });
    })
    .filter(Boolean)
    .filter((event) => isInDateRange(event, startDate, addDays(endDate, 12)));
}

function addDays(isoDate, offset) {
  const date = new Date(`${isoDate}T04:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
