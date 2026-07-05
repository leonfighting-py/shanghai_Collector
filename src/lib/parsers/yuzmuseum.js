import { buildEvent, decodeHtml, uniqueBy } from "./shared.js";

/**
 * Parse Chinese date range patterns from Yuz Museum.
 * Examples:
 *   "2026年5月8日至8月30日"
 *   "2026年3月22日–6月21日"
 */
function parseChineseDateRange(text) {
  if (!text) return { start_time: null, end_time: null };

  // Pattern: "2026年5月8日至8月30日" (same year, no year in end)
  const cnSameYear = text.match(
    /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:至|–|—|~|\-)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  );
  if (cnSameYear) {
    return {
      start_time: toShanghaiIso(cnSameYear[1], cnSameYear[2], cnSameYear[3]),
      end_time: toShanghaiIso(cnSameYear[1], cnSameYear[4], cnSameYear[5], 21),
    };
  }

  // Pattern: "2026年5月8日至2027年8月30日" (full dates with year)
  const cnFull = text.match(
    /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:至|–|—|~|\-)\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  );
  if (cnFull) {
    return {
      start_time: toShanghaiIso(cnFull[1], cnFull[2], cnFull[3]),
      end_time: toShanghaiIso(cnFull[4], cnFull[5], cnFull[6], 21),
    };
  }

  return { start_time: null, end_time: null };
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
 * Extract exhibition data from the Yuz Museum current exhibitions page.
 *
 * Each exhibition card has:
 *   <h5>
 *     <a href="URL">Title</a>
 *   </h5>
 *   <p>Date range</p>
 *
 * We find the body section by locating the H2 heading "当前展览"
 * in the <div class="entry-content">, then extract all h5 blocks
 * within that section.
 */
function extractExhibitions(html) {
  const rows = [];

  // Find the H2 heading ">当前展览<br" in the body content
  // (not the <title> tag or <meta> tags in <head>)
  const h2Idx = html.indexOf('>当前展览<br');
  if (h2Idx < 0) return rows;

  // Find the end of the entry content (before footer or article close)
  const sectionEnd = html.indexOf('<!-- .entry-content -->', h2Idx);
  const section = sectionEnd > h2Idx
    ? html.slice(h2Idx, sectionEnd)
    : html.slice(h2Idx, h2Idx + 20000);

  // Match each h5 block with its title link and subsequent date <p>
  // Pattern: <h5 ...> ... <a href="URL">Title</a> ... </h5> ... <p>Date</p>
  const h5Regex = /<h5[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h5>/gi;
  let h5Match;

  while ((h5Match = h5Regex.exec(section)) !== null) {
    const url = h5Match[1];
    const title = decodeHtml(h5Match[2]).trim();

    if (!title || title.length < 2) continue;

    // Find the next <p> after this h5 to get the date
    const afterH5 = section.slice(h5Match.index + h5Match[0].length);
    const datePmatch = afterH5.match(/<p>([\s\S]*?)<\/p>/i);
    const dateText = datePmatch ? decodeHtml(datePmatch[1]).trim() : "";

    // Skip if this is not a date (too short or doesn't contain year)
    if (!dateText.includes("2026") && !dateText.includes("2025")) continue;

    const { start_time, end_time } = parseChineseDateRange(dateText);

    rows.push({
      title,
      start_time,
      end_time,
      url,
    });
  }

  return rows;
}

/**
 * Parse exhibitions from 余德耀美术馆 (Yuz Museum) current exhibitions page.
 */
export function parseYuzMuseum(html, source) {
  const rows = extractExhibitions(html);
  if (rows.length === 0) return [];

  const events = rows
    .map((row) =>
      buildEvent({
        title: row.title,
        start_time: row.start_time,
        end_time: row.end_time,
        venue: "余德耀美术馆",
        signup_url: row.url,
        source,
      }),
    )
    .filter(Boolean);

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.start_time}`,
  );
}
