import { absoluteUrl, buildEvent, decodeHtml, parseFlexibleDate } from "./shared.js";

export function parseMapExhibitions(html, source) {
  const events = [];
  const pattern =
    /<a href="\/exhibitiondetail\?id=(\d+)"[\s\S]*?<img[^>]+alt="([^"]+)"[\s\S]*?<div class="title">([^<]+)<\/div>[\s\S]*?<div class="wt">(\d{4}-\d{2}-\d{2})/g;

  for (const match of html.matchAll(pattern)) {
    const event = buildEvent({
      title: decodeHtml(match[3] || match[2]),
      start_time: parseFlexibleDate(match[4]),
      venue: "浦东美术馆",
      signup_url: absoluteUrl(source.url, `/exhibitiondetail?id=${match[1]}`),
      source,
    });
    if (event) events.push(event);
  }

  return events;
}
