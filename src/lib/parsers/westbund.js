import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "https://www.westbund.com";

/**
 * Parse Chinese date string like "2021.07.28 - 2023.05.07" into ISO dates.
 */
function parseDateRange(text) {
  if (!text) return { start_time: null, end_time: null };

  text = text.trim();

  // Pattern: "2021.07.28 - 2023.05.07"
  const dotRange = text.match(/(20\d{2})\.(\d{2})\.(\d{2})\s*[-–—~]\s*(20\d{2})\.(\d{2})\.(\d{2})/);
  if (dotRange) {
    const sy = dotRange[1], sm = dotRange[2], sd = dotRange[3];
    const ey = dotRange[4], em = dotRange[5], ed = dotRange[6];
    return {
      start_time: `${sy}-${sm}-${sd}T10:00:00+08:00`,
      end_time: `${ey}-${em}-${ed}T21:00:00+08:00`,
    };
  }

  // Pattern: "2021.07.28"
  const singleDate = text.match(/^(20\d{2})\.(\d{2})\.(\d{2})$/);
  if (singleDate) {
    const d = `${singleDate[1]}-${singleDate[2]}-${singleDate[3]}`;
    return {
      start_time: `${d}T10:00:00+08:00`,
      end_time: null,
    };
  }

  return { start_time: null, end_time: null };
}

/**
 * Extract event cards from West Bund homepage.
 * Structure: <a class="box event col1"> with:
 *   <h3>title</h3>
 *   <time>2021.07.28 - 2023.05.07</time>
 *   <address>西岸美术馆</address>
 *
 * Skip events marked as "已结束" (ended).
 */
function extractEventCards(html) {
  const cards = [];
  // Match <a class="box event ..."> blocks up to the closing </a>
  const eventRegex = /<a\s+class="box event[^"]*"\s+href="([^"]+)">([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = eventRegex.exec(html)) !== null) {
    const href = match[1];
    const block = match[2];

    // Check if this event is marked as ended
    if (block.includes("已结束")) continue;

    const titleMatch = block.match(/<h3>([^<]+)<\/h3>/);
    const timeMatch = block.match(/<time>([^<]+)<\/time>/);
    const addrMatch = block.match(/<address>([^<]+)<\/address>/);

    if (!titleMatch) continue;

    const title = decodeHtml(titleMatch[1]);
    const timeText = timeMatch ? decodeHtml(timeMatch[1]) : "";
    const venue = addrMatch ? decodeHtml(addrMatch[1]) : "上海西岸";

    const { start_time, end_time } = parseDateRange(timeText);

    cards.push({
      title,
      start_time,
      end_time,
      venue,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  }

  return cards;
}

/**
 * Parse events from 西岸 West Bund homepage.
 * Only returns non-ended exhibition/event cards.
 */
export function parseWestbundEvents(html, source) {
  const cards = extractEventCards(html);

  const events = cards
    .map((card) => {
      if (!card.start_time) return null;
      return buildEvent({
        title: card.title,
        start_time: card.start_time,
        end_time: card.end_time,
        venue: card.venue,
        signup_url: card.url,
        source,
      });
    })
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.venue}|${event.start_time}`,
  );
}
