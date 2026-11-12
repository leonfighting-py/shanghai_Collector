// 候选打分：按「未来 14 天发布窗口内的实际可用条数」排序，用来挑选真正有召回价值的源（只读）
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { PARSERS } from "../src/lib/parsers/index.js";
import { filterPublishableEvents, isInDateRange, toShanghaiDayWindow } from "../src/lib/events.js";

import { readFileSync } from "node:fs";

const list = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { startDate, endDate } = toShanghaiDayWindow(new Date());
console.error("窗口:", startDate, "→", endDate);

async function probe(item) {
  const source = {
    name: item.name,
    url: item.url,
    category: item.category,
    venueLabel: item.venueLabel,
    defaultVenue: item.defaultVenue,
    tier: "T2",
  };
  try {
    const html = await defaultFetchHtml(item.url);
    const parsed = await PARSERS[item.parser || "cnCmsLectures"](html, source, { fetchHtml: defaultFetchHtml });
    const pub = filterPublishableEvents(parsed);
    const inWindow = pub.filter((event) => isInDateRange(event, startDate, endDate));
    const latest = pub.map((event) => event.start_time.slice(0, 10)).sort().reverse()[0] || "-";
    return { name: item.name, total: pub.length, win: inWindow.length, latest };
  } catch (error) {
    return { name: item.name, total: 0, win: 0, latest: "ERR:" + error.message.slice(0, 34) };
  }
}

const out = [];
for (let i = 0; i < list.length; i += 6) out.push(...(await Promise.all(list.slice(i, i + 6).map(probe))));
out.sort((a, b) => b.win - a.win || b.total - a.total);
console.error("窗口内  总条数  最近日期        源");
for (const row of out) {
  console.error(
    String(row.win).padStart(5) + "  " + String(row.total).padStart(6) + "   " + row.latest.padEnd(14) + " " + row.name,
  );
}
