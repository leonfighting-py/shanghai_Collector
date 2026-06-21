import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, stripTags, uniqueBy } from "./shared.js";

export async function parseShowstart(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  if (/totalCount:\s*0/.test(html) && /没有找到你想要的结果/.test(html)) {
    return [];
  }

  const inline = [];

  for (const match of html.matchAll(/href="([^"]*\/event\/\d+[^"?#]*)"[\s\S]{0,400}?/g)) {
    const chunk = match[0];
    const href = absoluteUrl(source.url, match[1]);
    const title =
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
    [...html.matchAll(/href="([^"]*\/event\/\d+[^"?#]*)"/g)].map((match) => absoluteUrl(source.url, match[1])),
    (href) => href,
  ).slice(0, 6);

  if (links.length === 0) return [];

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      detail.match(/property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ||
      stripTags(detail.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
    const dateText =
      detail.match(/<time[^>]+datetime=['"]([^'"]+)['"]/i)?.[1] ||
      detail.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/)?.[0];

    return buildEvent({
      title,
      start_time: parseFlexibleDate(dateText),
      venue: "上海",
      signup_url: href,
      source,
    });
  });
}
