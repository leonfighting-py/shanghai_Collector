import { absoluteUrl, buildEvent, decodeHtml, stripTags } from "./shared.js";

// 上海古典音乐会（shanghaiconcerts.com）：SSR 渲染的演出日历页。
// 页面按月分组：<section id="month-YYYY-MM">…</section>，每月内含若干演出行
// <div data-surface="concert-row">，行内有：
//   <a href="/concerts/…" aria-label="标题">            → 详情链接 / 标题
//   <h3 …>标题</h3>                                    → 标题兜底
//   <span class="nums … font-bold">日</span>            → 日期中的「日」
//   <p class="text-muted-foreground text-meta nums …">场馆 · 19:45</p>  → 场馆 + 开演时间
// 日期的年月来自所属 section 的 id，无需逐条抓详情页。
const MAX_ROWS = 80;

function sectionsOf(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const starts = [...body.matchAll(/<section id="month-(20\d{2}-\d{2})"/g)];
  return starts.map((match, index) => {
    const from = match.index;
    const to = index + 1 < starts.length ? starts[index + 1].index : body.length;
    return { yearMonth: match[1], html: body.slice(from, to) };
  });
}

function rowsOf(html) {
  const starts = [...html.matchAll(/data-surface="concert-row"/g)];
  return starts.map((match, index) => {
    const from = match.index;
    const to = index + 1 < starts.length ? starts[index + 1].index : html.length;
    return html.slice(from, to);
  });
}

function buildShanghaiDate(yearMonth, day, time) {
  const hourMinute = (time || "").match(/(\d{1,2})[:：](\d{2})/);
  const hour = hourMinute ? String(hourMinute[1]).padStart(2, "0") : "19";
  const minute = hourMinute ? hourMinute[2] : "30";
  return `${yearMonth}-${String(day).padStart(2, "0")}T${hour}:${minute}:00+08:00`;
}

export function parseShanghaiConcerts(html, source) {
  const events = [];
  let count = 0;

  for (const section of sectionsOf(html)) {
    for (const row of rowsOf(section.html)) {
      if (count >= MAX_ROWS) return events;
      const href = row.match(/<a\s+href="(\/concerts\/[^"]+)"/)?.[1];
      const titleRaw =
        row.match(/aria-label="([^"]*)"/)?.[1] || stripTags(row.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] || "");
      const title = decodeHtml(titleRaw).trim();
      const day = row.match(/class="nums[^"]*font-bold">\s*(\d{1,2})\s*<\/span>/)?.[1];
      if (!href || !title || !day) continue;

      // 「东方演奏厅 · 19:45 · ¥100–¥300」取第一段为场馆，内含时间则一并解析
      const meta = decodeHtml(stripTags(row.match(/<p class="text-muted-foreground text-meta nums[^"]*">([\s\S]*?)<\/p>/)?.[1] || ""));
      const venue = meta.split("·")[0].trim() || "上海";

      const event = buildEvent({
        title,
        start_time: buildShanghaiDate(section.yearMonth, day, meta),
        venue,
        signup_url: absoluteUrl(source.url, href),
        source,
      });
      if (event) {
        events.push(event);
        count += 1;
      }
    }
  }

  return events;
}
