import { absoluteUrl, buildEvent, stripTags } from "./shared.js";

// 意大利驻沪总领事馆文化处「活动日历」：https://iicshanghai.esteri.it/zh/gli_eventi/calendario/
// WordPress 卡片列表：每张卡片含标题链接与英文日期区间，例如
//   <a href="…/calendario/mostra-…/" title="阅读文章: 展览“乔治·莫兰迪：独白”">…</a>
//   卡片文本："进行中 Wed Jun 17 2026 Sat Oct 31 2026 展览“乔治·莫兰迪：独白” …"
// 日期为英文缩写月份 + 日 + 年（首尾两个分别为开始/结束）。

const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const CARD_RE =
  /<a href="(https:\/\/iicshanghai\.esteri\.it\/zh\/gli_eventi\/calendario\/[^"]+)"\s+title="阅读文章:\s*([^"]+)"/g;
const EN_DATE_RE = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(20\d{2})/g;

function toIsoDate(monthAbbr, day, year) {
  const month = MONTHS[String(monthAbbr).toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

export function parseIicShanghai(html, source) {
  const events = [];
  const seen = new Set();

  for (const match of html.matchAll(CARD_RE)) {
    const href = absoluteUrl(source.url, match[1]);
    const title = stripTags(match[2]).trim();
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);

    // 日期在链接之后约 2KB 的卡片正文内
    const context = html.slice(match.index, match.index + 2600);
    const dates = [...context.matchAll(EN_DATE_RE)].map((m) => toIsoDate(m[1], m[2], m[3])).filter(Boolean);
    if (dates.length === 0) continue;

    const event = buildEvent({
      title,
      start_time: dates[0],
      end_time: dates.length > 1 ? dates[1] : null,
      venue: "上海",
      signup_url: href,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}