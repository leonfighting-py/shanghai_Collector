import { buildEvent, decodeHtml, stripTags, uniqueBy } from "./shared.js";

const SHANGHAI_URL = "https://art.icity.ly/shanghai";

/**
 * Parse relative date strings like "74天后结束", "4天后开始", "常设展"
 * and convert to ISO date strings.
 */
function parseRelativeDate(pretitle, now = new Date()) {
  if (!pretitle?.trim()) return { start_time: null, end_time: null };

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const text = pretitle.trim();

  // 常设展 = permanent exhibition, currently open
  if (text.includes("常设展")) {
    const start = new Date(today);
    start.setDate(start.getDate() - 60);
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    return {
      start_time: toShanghaiIso(start),
      end_time: toShanghaiIso(end),
    };
  }

  // X天后结束 = ends in X days, currently open
  const endsIn = text.match(/(\d+)\s*天后结束/);
  if (endsIn) {
    const days = parseInt(endsIn[1], 10);
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    // For ongoing exhibitions, estimate start as 30 days ago
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return {
      start_time: toShanghaiIso(start),
      end_time: toShanghaiIso(end, 21),
    };
  }

  // X天后开始 = starts in X days, upcoming
  const startsIn = text.match(/(\d+)\s*天后开始/);
  if (startsIn) {
    const days = parseInt(startsIn[1], 10);
    const start = new Date(today);
    start.setDate(start.getDate() + days);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    return {
      start_time: toShanghaiIso(start),
      end_time: toShanghaiIso(end, 21),
    };
  }

  return { start_time: null, end_time: null };
}

/** Clean venue name by stripping label prefixes like "展览", "未开始" */
function cleanVenue(venue) {
  if (!venue) return "";
  return venue
    .replace(/^(展览|未开始|已结束|进行中|即将开始)\s+/i, "")
    .trim();
}

function toShanghaiIso(date, hour = 10) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:00:00+08:00`;
}

/**
 * Extract exhibition cards from the iMuseum Shanghai listing page.
 *
 * The page has two sections:
 * 1. "World" featured section with <a class="box"> cards (skip these)
 * 2. Shanghai grid with <a class="info"> cards
 *
 * Info card structure:
 *   <a class="info" href="/events/XXX">
 *     <div class="title">展览名称</div>
 *     <div class="pretitle">64 天后结束<span class="stats">...</span></div>
 *     <div class="subtitle"><span class="label">展览</span>上海博物馆东馆</div>
 *   </a>
 */
function extractInfoCards(html) {
  // Find the Shanghai grid section — starts after the city heading
  const shanghaiHeading = html.indexOf("上海<b class=\"caret\"");
  const section = shanghaiHeading > 0 ? html.slice(shanghaiHeading) : html;

  const cards = [];
  const cardRegex = /<a\s+class="info"\s+href="(\/events\/[a-z0-9]+)">([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = cardRegex.exec(section)) !== null) {
    const url = match[1];
    const block = match[2];

    const titleMatch = block.match(/class="title">([^<]+)</);
    const pretitleRaw = block.match(/class="pretitle">([\s\S]*?)<\/div>/);
    const subtitleRaw = block.match(/class="subtitle">([\s\S]*?)<\/div>/);

    const title = titleMatch ? decodeHtml(titleMatch[1]) : "";
    if (!title) continue;

    // Clean pretitle: extract only the date text, strip nested spans
    const pretitle = pretitleRaw
      ? stripTags(pretitleRaw[1]).replace(/\s+/g, " ").trim()
      : "";

    // Clean subtitle: strip label span to get venue name
    const subtitle = subtitleRaw
      ? stripTags(subtitleRaw[1]).replace(/\s+/g, " ").trim()
      : "";

    cards.push({ url, title, pretitle, venue: subtitle });
  }

  return cards;
}

/**
 * Parse iMuseum Shanghai exhibition listings.
 */
export function parseIMuseumShanghai(html, source, { now = new Date() } = {}) {
  const cards = extractInfoCards(html);
  if (cards.length === 0) return [];

  const events = [];

  for (const card of cards) {
    if (!card.venue) continue;

    const { start_time, end_time } = parseRelativeDate(card.pretitle, now);
    if (!start_time) continue;

    const event = buildEvent({
      title: card.title,
      start_time,
      end_time,
      venue: cleanVenue(card.venue),
      signup_url: `https://art.icity.ly${card.url}`,
      source,
    });

    if (event) events.push(event);
  }

  return uniqueBy(
    events,
    (event) => `${event.title}|${event.venue}|${event.start_time}`,
  );
}
