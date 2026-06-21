import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, parseFlexibleDate, stripTags, uniqueBy } from "./shared.js";

/**
 * Generic listing parser: find detail links on an index page, then fetch each detail page.
 */
export async function parseListingSite(html, source, options = {}) {
  const {
    fetchHtml = defaultFetchHtml,
    linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi,
    linkFilter = () => true,
    titlePattern = /property="og:title"\s+content="([^"]+)"/,
    datePattern = /(20\d{2}[-年/]\d{1,2}[-月/]\d{1,2})/,
    venuePattern = null,
    defaultVenue = "上海",
    maxLinks = 8,
  } = options;

  const candidates = [];
  for (const match of html.matchAll(linkPattern)) {
    const href = absoluteUrl(source.url, match[1]);
    const label = stripTags(match[2] || "");
    if (!href || !linkFilter(href, label, match)) continue;
    candidates.push({ href, label });
  }

  const links = uniqueBy(candidates, (item) => item.href).slice(0, maxLinks);

  return mapWithLimit(links, 3, async ({ href, label }) => {
    const detail = await fetchHtml(href);
    const title = detail.match(titlePattern)?.[1] || label;
    const dateText = detail.match(datePattern)?.[1] || detail.match(/<time[^>]+datetime="([^"]+)"/)?.[1];
    const venue = venuePattern ? detail.match(venuePattern)?.[1] || defaultVenue : defaultVenue;

    return buildEvent({
      title,
      start_time: parseFlexibleDate(dateText),
      venue,
      signup_url: href,
      source,
    });
  });
}

export function parseFosunFoundation(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => href.includes("/zh/exhibitions/") && !href.includes("past"),
    defaultVenue: "复星艺术中心",
  });
}

export function parseRockbundArtMuseum(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) =>
      /exhibition|program|展览|活动/i.test(href) || /展览|活动|展/.test(label),
    defaultVenue: "上海外滩美术馆",
  });
}

export function parseFotografiska(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /\/en\/exhibitions\/[^/]+$/i.test(href),
    defaultVenue: "Fotografiska Shanghai",
  });
}

export function parseShisuEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) => href.includes("event.shisu.edu.cn") && label.length >= 4,
    defaultVenue: "上海外国语大学",
  });
}

export function parseSjtuEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => href.includes("/cn/event/") && !href.endsWith("/cn/event/"),
    defaultVenue: "上海交通大学",
    maxLinks: 4,
  });
}

export function parseSjtuLectures(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) => /dsjt|讲坛|讲座|大师/.test(`${href}${label}`),
    defaultVenue: "上海交通大学",
    maxLinks: 4,
  });
}

export function parseHuodongShanghai(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => href.includes("huodong.com") && /\/\d+/.test(href),
    defaultVenue: "上海",
  });
}

export function parsePsaShanghai(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) =>
      /powerstationofart\.com\/.*exhibition/i.test(href) || /展览|展/.test(label),
    defaultVenue: "上海当代艺术博物馆",
    maxLinks: 6,
  });
}

export function parseChinaArtMuseum(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /chinaartmuseum\.org\.cn/.test(href) && /zhan|exhibit|detail|show/.test(href),
    defaultVenue: "中华艺术宫",
    maxLinks: 6,
  });
}

export function parseLongMuseum(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /longmuseum\.org\.cn/.test(href) && /exhibit|detail|show/.test(href),
    defaultVenue: "龙美术馆",
    maxLinks: 6,
  });
}

export function parseMapShanghai(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /museumofartpd\.org\.cn\/exhibition/.test(href) && !href.includes("/en/"),
    defaultVenue: "浦东美术馆",
    maxLinks: 6,
  });
}

export function parseUccaEdge(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /ucca\.org\.cn\/exhibitions\//.test(href) && !href.includes("/en/"),
    defaultVenue: "UCCA Edge",
    maxLinks: 6,
  });
}

export function parseFotografiskaZh(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /fotografiska\.com\/zh\//.test(href),
    defaultVenue: "Fotografiska Shanghai",
    maxLinks: 6,
  });
}

export function parseFudanEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) =>
      /fudan\.edu\.cn/.test(href) && /Events|活动|讲座|report/.test(`${href}${label}`) && !href.includes("/en/"),
    defaultVenue: "复旦大学",
    maxLinks: 6,
  });
}

export function parseShanghaiTechEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /shanghaitech\.edu\.cn\/.*events/.test(href) && !href.includes("/en/"),
    defaultVenue: "上海科技大学",
    maxLinks: 6,
  });
}

export function parseTongjiEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) =>
      /tongji\.edu\.cn/.test(href) && /活动|讲座|info|report|event/.test(`${href}${label}`),
    defaultVenue: "同济大学",
    maxLinks: 6,
  });
}

export function parseEcnuEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href) => /ecnu\.edu\.cn/.test(href) && /activity|event|report|info/.test(href),
    defaultVenue: "华东师范大学",
    maxLinks: 6,
  });
}
