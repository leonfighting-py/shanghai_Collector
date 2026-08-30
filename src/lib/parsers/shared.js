import { isEventLikeTitle } from "../events.js";

export function decodeHtml(text = "") {
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function absoluteUrl(base, href) {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function buildEvent({ title, start_time, end_time, venue, signup_url, image_url, source }) {
  if (!title || !start_time || !source) return null;
  const cleanTitle = decodeHtml(title);
  if (!isEventLikeTitle(cleanTitle)) return null;

  const normalizedStart = normalizeDateTime(start_time);
  if (!normalizedStart) return null;

  const url = signup_url || source.url;
  // 封面图仅接受 http(s)，防止解析出协议注入
  const image = typeof image_url === "string" && /^https?:\/\//i.test(image_url.trim()) ? image_url.trim() : null;
  return {
    title: cleanTitle,
    start_time: normalizedStart,
    end_time: end_time ? normalizeDateTime(end_time) : null,
    venue: decodeHtml(venue || "上海"),
    category: source.category,
    signup_url: url,
    source_name: source.name,
    source_url: url,
    image_url: image,
  };
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const date = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00+08:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === y &&
    date.getMonth() + 1 === m &&
    date.getDate() === d
  );
}

function formatShanghaiDateTime(year, month, day, hour = 10, minute = 0) {
  if (!isValidDateParts(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}

export function normalizeDateTime(value) {
  if (!value) return null;
  const text = String(value).trim();

  const isoDate = text.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (isoDate) return formatShanghaiDateTime(isoDate[1], isoDate[2], isoDate[3]);

  if (/^20\d{2}-\d{2}-\d{2}T/.test(text)) {
    const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text}+08:00`;
    const date = new Date(withZone);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseFlexibleDate(text, fallbackYear = new Date().getFullYear()) {
  if (!text) return null;
  const cn = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cn) return formatShanghaiDateTime(cn[1], cn[2], cn[3]);

  const iso = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return formatShanghaiDateTime(iso[1], iso[2], iso[3]);

  const slash = text.match(/(20\d{2})[./](\d{1,2})[./](\d{1,2})/);
  if (slash) return formatShanghaiDateTime(slash[1], slash[2], slash[3]);

  const en = text.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(20\d{2})/);
  if (en) {
    const month = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const key = en[2].slice(0, 3).toLowerCase();
    if (month[key]) return formatShanghaiDateTime(en[3], month[key], en[1], 19);
  }

  return formatShanghaiDateTime(fallbackYear, 6, 15);
}

export function uniqueBy(events, keyFn) {
  const seen = new Set();
  return events.filter((event) => {
    const key = keyFn(event);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function mapWithLimit(items, limit, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const chunkResults = await Promise.all(chunk.map(mapper));
    results.push(...chunkResults);
  }
  return results.flat().filter(Boolean);
}

export function stripTags(html) {
  return decodeHtml(
    String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );
}
