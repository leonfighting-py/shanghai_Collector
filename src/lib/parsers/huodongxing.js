import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, stripTags, uniqueBy } from "./shared.js";

export async function parseHuodongxing(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  // eventlist 页面（SSR）：item-title（标题）+ item-data（日期）+ item-dress（地点）+ item-logo（封面）
  const listed = [];
  const seenEventIds = new Set();

  for (const match of html.matchAll(
    /<a class="item-title" href="(\/event\/\d+[^"]*)"[^>]*>([^<]+)<\/a>/g,
  )) {
    const href = absoluteUrl(source.url, match[1].replace(/&amp;/g, "&"));
    const eventId = href.match(/\/event\/(\d+)/)?.[1];
    if (!eventId || seenEventIds.has(eventId)) continue;
    seenEventIds.add(eventId);

    const context = html.slice(match.index, match.index + 1200);
    const dateText = context.match(/(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})/)?.[0];
    const venue = stripTags(
      context.match(/class="item-dress[^"]*"[^>]*>[\s\S]*?<\/span>([^<]+)/i)?.[1] || "",
    );
    // 封面图：本卡片上方的 <img class="item-logo" src="...">（取最近一个）
    const before = html.slice(Math.max(0, match.index - 500), match.index);
    const logoMatches = [...before.matchAll(/class="item-logo" src="([^"]+)"/gi)];
    const logo = logoMatches.length > 0 ? logoMatches[logoMatches.length - 1][1] : null;

    const event = buildEvent({
      title: stripTags(match[2]),
      start_time: parseFlexibleDate(dateText),
      venue: venue || "上海",
      signup_url: href,
      image_url: logo,
      source,
    });
    if (event) listed.push(event);
  }

  if (listed.length > 0) return listed.slice(0, 20);

  const inline = [];

  for (const match of html.matchAll(/href="(\/event\/\d+[^"?#]*)"[\s\S]{0,300}?/g)) {
    const chunk = match[0];
    const href = absoluteUrl(source.url, match[1]);
    const title =
      stripTags(chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "") ||
      stripTags(chunk.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") ||
      stripTags(chunk.match(/title="([^"]{4,120})"/)?.[1] || "");
    const dateText = chunk.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] || chunk.match(/(\d{1,2}月\d{1,2}日)/)?.[1];
    const event = buildEvent({
      title,
      start_time: parseFlexibleDate(dateText),
      venue: "上海",
      signup_url: href,
      source,
    });
    if (event) inline.push(event);
  }

  if (inline.length > 0) return uniqueBy(inline, (event) => event.signup_url).slice(0, 8);

  const links = uniqueBy(
    [...html.matchAll(/href="(\/event\/\d+[^"?#]*)"/g)].map((match) => absoluteUrl(source.url, match[1])),
    (href) => href,
  ).slice(0, 4);

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/<h1[^>]*>([^<]+)/)?.[1];
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
