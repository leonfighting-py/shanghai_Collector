import { defaultFetchHtml } from "../fetch-html.js";
import { buildEvent, parseFlexibleDate } from "./shared.js";

function parseEmbeddedPerformances(html, source) {
  const events = [];
  const seen = new Set();
  const patterns = [
    /"performanceName":"([^"]+)".*?"showTime":"([^"]+)".*?"theaterName":"([^"]+)"/gs,
    /"name":"([^"]{4,80})".*?"showTime":"([^"]+)".*?"theaterName":"([^"]+)"/gs,
    /"projectName":"([^"]{4,80})".*?"showTime":"([^"]+)"/gs,
    /"nm":"([^"]{4,80})".*?"rt":"[^"]*".*?"showTime":"([^"]+)"/gs,
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

export async function parseMaoyan(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const fromPage = parseEmbeddedPerformances(html, source);
  if (fromPage.length > 0) return fromPage;

  const fallbackUrls = [
    "https://www.damai.cn/search.html?city=上海&order=1",
    "https://m.maoyan.com/performances",
  ];

  for (const url of fallbackUrls) {
    try {
      const fallbackHtml = await fetchHtml(url);
      const events = parseEmbeddedPerformances(fallbackHtml, {
        ...source,
        url,
      });
      if (events.length > 0) return events;
    } catch {
      // try next fallback
    }
  }

  return [];
}
