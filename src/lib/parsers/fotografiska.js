import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, uniqueBy } from "./shared.js";

export async function parseFotografiska(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const inline = [...html.matchAll(
    /href="(\/en\/exhibitions\/[^"?#]+)"[^>]*>[\s\S]*?Until\s+(\d{1,2}\s+[A-Za-z]{3}\s+20\d{2})[\s\S]*?<h3[^>]*>([^<]+)</gi,
  )]
    .map((match) =>
      buildEvent({
        title: match[3].trim(),
        start_time: parseFlexibleDate(match[2]),
        venue: "Fotografiska Shanghai",
        signup_url: absoluteUrl(source.url, match[1]),
        source,
      }),
    )
    .filter(Boolean);

  if (inline.length > 0) return uniqueBy(inline, (event) => event.signup_url);

  const links = uniqueBy(
    [...html.matchAll(/href="(\/en\/exhibitions\/[^"?#]+)"/g)].map((match) => absoluteUrl(source.url, match[1])),
    (href) => href,
  ).slice(0, 6);

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/<h1[^>]*>([^<]+)/)?.[1];
    const dateText =
      detail.match(/Until\s+(\d{1,2}\s+[A-Za-z]{3}\s+20\d{2})/i)?.[1] ||
      detail.match(/(20\d{2}-\d{2}-\d{2})/)?.[1];

    return buildEvent({
      title: title?.split("|")[0]?.trim(),
      start_time: parseFlexibleDate(dateText),
      venue: "Fotografiska Shanghai",
      signup_url: href,
      source,
    });
  });
}
