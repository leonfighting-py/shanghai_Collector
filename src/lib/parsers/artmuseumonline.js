import { absoluteUrl, buildEvent, decodeHtml, parseFlexibleDate } from "./shared.js";

export function parseChinaArtMuseumExhibitions(html, source) {
  const events = [];
  const seen = new Set();
  const pattern =
    /(?:《([^》]{4,80})》|>([^<《]{4,80}[\u4e00-\u9fff][^<]{0,40}))<[\s\S]{0,400}?展期：(\d{4})年(\d{1,2})月(\d{1,2})日/g;

  for (const match of html.matchAll(pattern)) {
    let title = decodeHtml(match[1] || match[2]).trim();
    if (!title || seen.has(title)) continue;
    if (/^(本次|展期|展厅|pageCount|alert|输入页数)/.test(title)) continue;
    if (title.length > 50) continue;
    seen.add(title);

    const event = buildEvent({
      title,
      start_time: parseFlexibleDate(`${match[3]}-${match[4]}-${match[5]}`),
      venue: "中华艺术宫",
      signup_url: absoluteUrl(source.url, "/art/art/zlgz/zl/dqzl/index.html"),
      source,
    });
    if (event) events.push(event);
  }

  return events.slice(0, 8);
}
