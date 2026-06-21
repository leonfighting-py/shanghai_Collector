import { defaultFetchHtml } from "../fetch-html.js";
import { buildEvent, decodeHtml, mapWithLimit, parseFlexibleDate, uniqueBy } from "./shared.js";

function parseDoubanListCards(html, source) {
  const events = [];

  for (const block of html.matchAll(
    /href="(https:\/\/www\.douban\.com\/event\/\d+\/)"[\s\S]{0,500}?/g,
  )) {
    const chunk = block[0];
    const signup_url = block[1];
    const title =
      chunk.match(/alt="([^"]{6,120})"/)?.[1] ||
      chunk.match(/title="([^"]{6,120})"/)?.[1] ||
      chunk.match(/<span[^>]*class="[^"]*event-title[^"]*"[^>]*>([^<]+)/)?.[1];
    const dateText =
      chunk.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
      chunk.match(/(\d{1,2}月\d{1,2}日)/)?.[1];
    const venue = chunk.match(/<span[^>]*class="[^"]*event-locality[^"]*"[^>]*>([^<]+)/)?.[1] || "上海";

    const event = buildEvent({
      title: decodeHtml(title || ""),
      start_time: parseFlexibleDate(dateText),
      venue: decodeHtml(venue),
      signup_url,
      source,
    });
    if (event) events.push(event);
  }

  return uniqueBy(events, (event) => event.signup_url).slice(0, 8);
}

export async function parseDoubanShanghai(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const fromList = parseDoubanListCards(html, source);
  if (fromList.length > 0) return fromList;

  const links = uniqueBy(
    [...html.matchAll(/href="(https:\/\/www\.douban\.com\/event\/\d+\/)"/g)].map((match) => match[1]),
    (href) => href,
  ).slice(0, 3);

  return mapWithLimit(links, 1, async (link) => {
    const detail = await fetchHtml(link);
    if (/检测|captcha|robot/i.test(detail)) return null;

    const title = decodeHtml(
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
        detail.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*-\s*豆瓣.*$/u, "") ||
        "",
    );
    const start =
      detail.match(/property=['"]event:start_time['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/(\d{4}-\d{2}-\d{2})/)?.[1];

    return buildEvent({ title, start_time: start, venue: "上海", signup_url: link, source });
  });
}
