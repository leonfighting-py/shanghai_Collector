import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

const BASE_URL = "https://whlyj.sh.gov.cn";

/**
 * Parse art events from 上海市文化和旅游局 艺术活动 page.
 * Structure: <ul class="list-ul"> > <li class="flex-box v-center">
 *   <a href="..." title="...">title</a>
 *   <span class="flex-r date">YYYY-MM-DD</span>
 */
function extractListItems(html) {
  // Find the list-ul section
  const listMatch = html.match(/<ul class="list-ul">([\s\S]*?)<\/ul>/);
  if (!listMatch) return [];

  const listHtml = listMatch[1];
  const items = [];
  const itemRegex = /<li class="flex-box v-center">\s*<a href="([^"]+)" title="([^"]*)"[^>]*>([^<]+)<\/a>\s*<span class="flex-r date">([^<]+)<\/span>/gi;
  let match;

  while ((match = itemRegex.exec(listHtml)) !== null) {
    const href = match[1];
    const titleAttr = decodeHtml(match[2]);
    const linkText = decodeHtml(match[3]);
    const dateStr = match[4].trim();

    // Prefer the title attribute (usually more complete), fall back to link text
    const title = titleAttr.length >= linkText.length ? titleAttr : linkText;
    if (!title) continue;

    // dateStr should be YYYY-MM-DD
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dateStr)) continue;

    items.push({
      title,
      date: dateStr,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  }

  return items;
}

/**
 * Parse art events from 上海文旅局 艺术活动 page.
 */
export function parseWhlyjEvents(html, source) {
  const items = extractListItems(html);
  if (items.length === 0) return [];

  const events = items
    .map((item) => {
      // Use ISO date string directly — normalizeDateTime in buildEvent handles YYYY-MM-DD
      const startTime = `${item.date}T10:00:00+08:00`;
      const endTime = `${item.date}T21:00:00+08:00`;

      return buildEvent({
        title: item.title,
        start_time: startTime,
        end_time: endTime,
        venue: "上海",
        signup_url: item.url,
        source,
      });
    })
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
