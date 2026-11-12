import { buildEvent, stripTags } from "./shared.js";

// 宝龙美术馆「正在热展 / 即将到来」：https://www.powerlongmuseum.com/exhibition_now.html
// 条目结构：
//   <div class="col-sm-4 iImg"><a href="…/exhibition_detail/140.html"><img src="…" /></a></div>
//   <div class="col-sm-8 iText"><div class="iTt"><h2><a href="…/exhibition_detail/140.html">快乐公式·史莱姆感官漫游记</a></h2>
//     <div class="iTtt">简介…</div></div>
//     <div class="iTb"><a href="…/exhibition_detail/140.html"><b>2026.10.01 ~ 2027.04.05</b>上海宝龙美术馆9号厅</a></div></div>

const ITEM_RE =
  /<div class="col-sm-4 iImg">[\s\S]{0,400}?<img src="([^"]+)"[\s\S]{0,600}?<h2><a href="([^"]+)">([^<]+)<\/a><\/h2>[\s\S]{0,1200}?<b>\s*(20\d{2})\.(\d{1,2})\.(\d{1,2})\s*[~～-]\s*(20\d{2})\.(\d{1,2})\.(\d{1,2})\s*<\/b>([^<]*)/g;

export function parsePowerlongMuseum(html, source) {
  const events = [];
  const seen = new Set();

  for (const match of html.matchAll(ITEM_RE)) {
    const [, image, href, titleRaw, y1, m1, d1, y2, m2, d2, venueRaw] = match;
    const title = stripTags(titleRaw).trim();
    if (!title || seen.has(href)) continue;
    seen.add(href);

    const venueText = stripTags(venueRaw).trim();
    const event = buildEvent({
      title,
      start_time: `${y1}-${m1.padStart(2, "0")}-${d1.padStart(2, "0")}`,
      end_time: `${y2}-${m2.padStart(2, "0")}-${d2.padStart(2, "0")}`,
      venue: venueText.includes("宝龙美术馆") ? venueText : `宝龙美术馆${venueText ? `·${venueText}` : ""}`,
      signup_url: href,
      image_url: image,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}