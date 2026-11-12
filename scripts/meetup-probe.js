// Meetup 上海群组重测（只读）：此前用 meetup(AI 过滤) 解析器全部为 0，改试纯 JSON-LD
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { PARSERS } from "../src/lib/parsers/index.js";
import { filterPublishableEvents, isInDateRange, toShanghaiDayWindow } from "../src/lib/events.js";

const GROUPS = [
  "shanghai-ai", "shanghai-python", "shanghai-javascript", "shanghai-machine-learning",
  "shanghai-data-science", "kubernetes-shanghai", "shanghai-blockchain",
  "shanghai-entrepreneurs-network", "shanghai-startup-network", "shanghai-product-management",
  "shanghai-web-developers", "shanghai-cloud-native", "shanghai-devops",
  "shanghai-software-testing-community", "shanghai-rust", "shanghai-golang",
  "shanghai-uiux", "shanghai-photography", "shanghai-language-exchange", "shanghai-hiking",
  "shanghai-board-games", "shanghai-tech",
];

const { startDate, endDate } = toShanghaiDayWindow(new Date());

async function run(slug, parserKey) {
  const source = { name: slug, url: `https://www.meetup.com/${slug}/`, category: "AI聚会", tier: "T2" };
  try {
    const html = await defaultFetchHtml(source.url);
    const events = filterPublishableEvents(await PARSERS[parserKey](html, source, { fetchHtml: defaultFetchHtml }));
    const win = events.filter((e) => isInDateRange(e, startDate, endDate)).length;
    return { slug, parserKey, count: events.length, win, sample: events[0]?.title?.slice(0, 46) || "" };
  } catch (error) {
    return { slug, parserKey, count: 0, win: 0, sample: "ERR " + error.message.slice(0, 30) };
  }
}

console.log("群组                                  jsonLD  窗口内   样例（首条）");
for (const slug of GROUPS) {
  const r = await run(slug, "allevents");
  console.log(
    `${slug.padEnd(36)} ${String(r.count).padStart(5)}${String(r.win).padStart(7)}   ${r.sample}`,
  );
}
