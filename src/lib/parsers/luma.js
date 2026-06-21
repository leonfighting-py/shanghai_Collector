import { parseJsonLdEvents } from "./json-ld.js";
import { defaultFetchHtml } from "../fetch-html.js";
import { buildEvent, parseFlexibleDate } from "./shared.js";

export async function parseLuma(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const fromJsonLd = parseJsonLdEvents(html, source);
  if (fromJsonLd.length > 0) return fromJsonLd;

  const cards = [...html.matchAll(/href="(https:\/\/lu\.ma\/[^"?]+)"/g)]
    .map((match) => match[1])
    .filter((href) => !href.endsWith("/shanghai") && !href.endsWith("/discover"));

  const events = [];
  for (const link of [...new Set(cards)].slice(0, 6)) {
    try {
      const detail = await fetchHtml(link);
      const title = detail.match(/property="og:title"\s+content="([^"]+)"/)?.[1];
      const dateText = detail.match(/<time[^>]+datetime="([^"]+)"/)?.[1];
      const venue = detail.match(/location[^>]*>([^<]{3,80})</i)?.[1] || "上海";
      const event = buildEvent({
        title,
        start_time: parseFlexibleDate(dateText),
        venue,
        signup_url: link,
        source,
      });
      if (event) events.push(event);
    } catch {
      // skip broken event pages
    }
  }

  return events;
}
