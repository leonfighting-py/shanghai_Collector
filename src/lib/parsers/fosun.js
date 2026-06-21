import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, uniqueBy } from "./shared.js";

export async function parseFosunFoundation(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const links = uniqueBy(
    [...html.matchAll(/href="(\/zh\/exhibitions\/[^"?#]+)"/g)]
      .map((match) => absoluteUrl(source.url, match[1]))
      .filter((href) => !href.includes("past")),
    (href) => href,
  ).slice(0, 6);

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/<h1[^>]*>([^<]+)/)?.[1] ||
      detail.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*[-|].*$/, "").trim();
    const dateText =
      detail.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)?.[0] ||
      detail.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] ||
      detail.match(/(20\d{2})[./](\d{1,2})[./](\d{1,2})/)?.[0];

    return buildEvent({
      title,
      start_time: parseFlexibleDate(dateText),
      venue: "复星艺术中心",
      signup_url: href,
      source,
    });
  });
}
