import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

/**
 * Parse date string like "2026-09-23 至 2026-09-23" or "2026-09-01 至 2026-09-30".
 */
function parseActivityDate(text) {
  if (!text) return { start_time: null, end_time: null };

  const trimmed = text.trim();

  // "2026-09-23 至 2026-09-23"
  const range = trimmed.match(/(20\d{2}-\d{2}-\d{2})\s*至\s*(20\d{2}-\d{2}-\d{2})/);
  if (range) {
    return {
      start_time: `${range[1]}T10:00:00+08:00`,
      end_time: `${range[2]}T21:00:00+08:00`,
    };
  }

  // Single date "2026-09-23"
  const single = trimmed.match(/^(20\d{2}-\d{2}-\d{2})$/);
  if (single) {
    return {
      start_time: `${single[1]}T10:00:00+08:00`,
      end_time: null,
    };
  }

  return { start_time: null, end_time: null };
}

/**
 * Extract commercial activity/event cards from 赢商网·华东 page.
 * Structure: <div class="hz-acitve-list"><ul><li>
 *   <div class="acitve-top">
 *     <p class="title"><a>title</a></p>
 *     <p class="address"><span>location</span></p>
 *     <span class="time"><span>date range</span></span>
 *   </div>
 * </li></ul></div>
 */
function extractActivityCards(html) {
  const cards = [];
  // Find the hz-acitve-list section
  const listMatch = html.match(/<div class="hz-acitve-list">([\s\S]*?)<!--活动结束-->/);
  if (!listMatch) return [];

  const listHtml = listMatch[1];
  // Match each <li> block
  const liRegex = /<li>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(listHtml)) !== null) {
    const block = match[1];

    // Extract title from <p class="title"><a>text</a></p>
    const titleMatch = block.match(/<p class="title">\s*<a[^>]*>([^<]+)<\/a>\s*<\/p>/);
    if (!titleMatch) continue;

    const title = decodeHtml(titleMatch[1]);

    // Extract address from <p class="address"><span>text</span></p>
    const addrMatch = block.match(/<p class="address">[\s\S]*?<span>([^<]+)<\/span>/);
    const venue = addrMatch ? decodeHtml(addrMatch[1]) : "上海";

    // Extract time from <span class="time"><span>text</span></span>
    const timeMatch = block.match(/<span class="time">[\s\S]*?<span>([^<]+)<\/span>/);
    const dateText = timeMatch ? decodeHtml(timeMatch[1]) : "";

    // Extract URL from the image link
    const urlMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>\s*<img/);
    const url = urlMatch ? urlMatch[1] : "";

    const { start_time, end_time } = parseActivityDate(dateText);

    cards.push({
      title,
      start_time,
      end_time,
      venue,
      url,
    });
  }

  return cards;
}

/**
 * Parse commercial events from 赢商网华东站 (Winshang Shanghai).
 */
export function parseWinshangShanghai(html, source) {
  const cards = extractActivityCards(html);

  const events = cards
    .map((card) => {
      if (!card.start_time) return null;
      return buildEvent({
        title: card.title,
        start_time: card.start_time,
        end_time: card.end_time,
        venue: card.venue,
        signup_url: card.url || source.url,
        source,
      });
    })
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
