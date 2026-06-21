import { buildEvent, parseFlexibleDate } from "./shared.js";

export function parseSmartShanghai(html, source) {
  const cards = [...html.matchAll(/<article class="event-card-horizontal"[\s\S]*?<\/article>/gi)];

  return cards
    .map((card) => {
      const block = card[0];
      const signup_url = block.match(/href="(https:\/\/www\.smartshanghai\.com\/event\/[^"]+)"/)?.[1];
      const title = block
        .match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const dateText =
        block.match(/(\d{1,2}\s+[A-Za-z]{3},?\s+20\d{2})/i)?.[1] ||
        block.match(/(20\d{2}-\d{2}-\d{2})/)?.[1];
      const venue = block.match(/class="[^"]*venue[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim() || "上海";

      return buildEvent({
        title,
        start_time: parseFlexibleDate(dateText),
        venue,
        signup_url,
        source,
      });
    })
    .filter(Boolean);
}
