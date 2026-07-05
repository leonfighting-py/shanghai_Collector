import { buildEvent, decodeHtml, stripTags, uniqueBy } from "./shared.js";

/**
 * Categories that are relevant for events/activities (vs. restaurant reviews, shopping guides, etc.)
 */
const EVENT_CATEGORIES = /Things to do|Art|Music|Events|Performing|Classical|Film|Nightlife|Family|Workshop|Festival|Exhibition/i;

/**
 * Extract the year and month from an image URL path like "/202405/2024050408245692.jpg"
 * Falls back to current date.
 */
function guessDateFromImageUrl(imgSrc) {
  if (!imgSrc) return null;

  // Match URLs like "/202405/2024050408245692.jpg" or "/202405/..."
  const pathMatch = imgSrc.match(/\/(20\d{2})(\d{2})\//);
  if (pathMatch) {
    return toShanghaiIso(pathMatch[1], pathMatch[2], "01");
  }

  return null;
}

function toShanghaiIso(year, month, day, hour = 10) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, "0");
  const d = String(Number(day)).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const date = new Date(`${y}-${m}-${d}T${h}:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y) return null;
  return `${y}-${m}-${d}T${h}:00:00+08:00`;
}

/**
 * Extract feature tiles from the TimeOut Shanghai homepage.
 *
 * The homepage is a magazine-style hub with feature articles organized in tiles:
 *   tile_hero, tile_large, tile_medium, tile_small
 * Each tile contains:
 *   - tile__title: article title
 *   - tile__description: short summary
 *   - tile__category: category tag (Things to do, Art, Restaurants, etc.)
 *   - tile__anchor_link or href: link to full article
 *   - tile__image: image URL with date prefix in path
 */
function extractTiles(html) {
  const tiles = [];

  // Match all tile variants
  const tileRegex = /<div\s+class="tile\s+(tile_\w+)\s+sectioncode_\d+\s+[^"]*"\s*>([\s\S]*?)<\/div>\s*<\/div>\s*(?=\s*<div\s+class="tile|\s*<\/div>\s*<\/div>\s*(?:<div|$))/gi;
  let match;

  while ((match = tileRegex.exec(html)) !== null) {
    const tileType = match[1];
    const block = match[2];

    // Extract title
    const titleMatch = block.match(/<h3\s+class="tile__title">([^<]+)<\/h3>/i);
    const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : "";
    if (!title || title.length < 6) continue;

    // Extract description
    const descMatch = block.match(/<p\s+class="tile__description">([^<]+)<\/p>/i);
    const description = descMatch ? decodeHtml(descMatch[1]).trim() : "";

    // Extract category
    const catMatch = block.match(/tile__category">([^<]+)</i);
    const category = catMatch ? decodeHtml(catMatch[1]).trim() : "";

    // Extract link
    const linkMatch = block.match(/<a\s+class="tile__anchor_link"\s+href="([^"]+)"/i);
    const href = linkMatch ? linkMatch[1] : null;

    // Extract image URL for date
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*tile__image/i) ||
                     block.match(/<img[^>]*class="[^"]*tile__image[^"]*"[^>]*src="([^"]+)"/i);
    const imgSrc = imgMatch ? imgMatch[1] : null;

    tiles.push({
      tileType,
      title,
      description,
      category,
      href,
      imgSrc,
    });
  }

  return tiles;
}

/**
 * Parse the TimeOut Shanghai homepage for event-like features.
 *
 * TimeOut Shanghai is an English-language magazine. Its homepage features
 * article tiles (tile_hero, tile_large, tile_medium, tile_small) rather than
 * structured event listings. This parser extracts feature articles from
 * event-relevant categories (Things to do, Art, Music, etc.) and treats
 * them as discoverable activities.
 *
 * The /events.html page would have more structured event listings, but we
 * work with whatever HTML is provided.
 *
 * @param {string} html - The listing page HTML
 * @param {{name: string, url: string, category: string, locale: string}} source - Source metadata
 * @returns {Array} Array of event objects
 */
export function parseTimeoutShanghai(html, source) {
  const tiles = extractTiles(html);
  const events = [];

  for (const tile of tiles) {
    // Try to find a date
    let startTime = guessDateFromImageUrl(tile.imgSrc);
    if (!startTime) {
      // Fallback to current date for recent content
      const now = new Date();
      startTime = toShanghaiIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    // Use category as venue hint, or "Shanghai"
    const venue = tile.category && EVENT_CATEGORIES.test(tile.category)
      ? tile.category
      : "Shanghai";

    const url = tile.href
      ? (tile.href.startsWith("http") ? tile.href : `https://www.timeoutshanghai.com${tile.href}`)
      : source.url;

    const event = buildEvent({
      title: tile.title,
      start_time: startTime,
      end_time: null,
      venue,
      signup_url: url,
      source,
    });

    if (event) events.push(event);
  }

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
