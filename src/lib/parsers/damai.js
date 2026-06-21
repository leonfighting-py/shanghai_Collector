import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, stripTags, uniqueBy } from "./shared.js";

function parseEmbeddedProjects(html, source) {
  const events = [];
  const seen = new Set();
  const patterns = [
    /"projectName":"([^"]{2,120})".*?"showTime":"([^"]+)".*?"venueName":"([^"]*)"/gs,
    /"name":"([^"]{2,120})".*?"showTime":"([^"]+)".*?"cityname":"上海"/gs,
    /"nameCn":"([^"]{2,120})".*?"showTime":"([^"]+)"/gs,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const key = `${match[1]}|${match[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const event = buildEvent({
        title: match[1],
        start_time: parseFlexibleDate(match[2]),
        venue: match[3] || "上海",
        signup_url: source.url,
        source,
      });
      if (event) events.push(event);
    }
  }

  return events;
}

export async function parseDamai(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const fromPage = parseEmbeddedProjects(html, source);
  if (fromPage.length > 0) return fromPage;

  const links = uniqueBy(
    [...html.matchAll(/href="([^"]*\/item\.[^"?#]+)"/g)].map((match) => absoluteUrl(source.url, match[1])),
    (href) => href,
  ).slice(0, 6);

  if (links.length === 0) {
    try {
      const searchHtml = await fetchHtml("https://www.damai.cn/search.html?city=上海&order=1");
      return parseEmbeddedProjects(searchHtml, { ...source, url: "https://www.damai.cn/search.html?city=上海&order=1" });
    } catch {
      return [];
    }
  }

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      stripTags(detail.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
    const dateText =
      detail.match(/<time[^>]+datetime=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/)?.[0];

    return buildEvent({
      title,
      start_time: parseFlexibleDate(dateText),
      venue: "上海",
      signup_url: href,
      source,
    });
  });
}
