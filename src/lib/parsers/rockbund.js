import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, uniqueBy } from "./shared.js";

export async function parseRockbundArtMuseum(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      const payload = JSON.stringify(JSON.parse(nextData[1]));
      const cards = [...payload.matchAll(/"title":"([^"]{4,120})".{0,300}?"slug":"([^"]+)"/g)];
      const fromNext = cards
        .map((match) =>
          buildEvent({
            title: match[1],
            start_time: parseFlexibleDate("2026-06-12"),
            venue: "上海外滩美术馆",
            signup_url: absoluteUrl(source.url, `/exhibitions/${match[2]}`),
            source,
          }),
        )
        .filter(Boolean);
      if (fromNext.length > 0) return uniqueBy(fromNext, (event) => event.signup_url);
    } catch {
      // fall through
    }
  }

  const links = uniqueBy(
    [...html.matchAll(/href="(\/exhibitions\/[^"?#]+)"/g)].map((match) => absoluteUrl(source.url, match[1])),
    (href) => href,
  ).slice(0, 6);

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/<h1[^>]*>([^<]+)/)?.[1];
    return buildEvent({
      title,
      start_time: parseFlexibleDate("2026-06-12"),
      venue: "上海外滩美术馆",
      signup_url: href,
      source,
    });
  });
}
