import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, stripTags, uniqueBy } from "./shared.js";

function isShanghaiEvent(title, venue, detail) {
  const headline = `${title} ${venue}`;
  if (/上海/.test(headline)) return true;
  if (/北京|广州|深圳|杭州|成都|武汉|西安|南京|重庆/.test(headline)) return false;
  return /上海|黄浦|浦东|静安|徐汇|长宁|虹口|杨浦|闵行|宝山|嘉定|松江|青浦|奉贤|崇明/.test(detail.slice(0, 2500));
}

export async function parseHuodongBa(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const links = uniqueBy(
    [...html.matchAll(/href="(\/event\/detail\/[^"?#]+)"/g)].map((match) => absoluteUrl(source.url, match[1])),
    (href) => href,
  ).slice(0, 10);

  if (links.length === 0) return [];

  return mapWithLimit(links, 2, async (href) => {
    const detail = await fetchHtml(href);
    const title =
      stripTags(detail.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") ||
      stripTags(detail.match(/<title>([^<]+)<\/title>/i)?.[1] || "").replace(/\s*-\s*活动网.*$/i, "");
    const dateText =
      detail.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] ||
      detail.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/)?.[0];
    const venue = stripTags(detail.match(/class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "");
    const context = detail.slice(0, 2500);

    if (!isShanghaiEvent(title, venue, context)) return null;

    return buildEvent({
      title,
      start_time: parseFlexibleDate(dateText),
      venue: venue || "上海",
      signup_url: href,
      source,
    });
  });
}
