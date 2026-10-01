// 抓样本：打印候选列表中「日期 + 链接」附近的 HTML 片段，用于编写/校验新模板（只读）
import { defaultFetchHtml } from "../src/lib/fetch-html.js";

const urls = process.argv.slice(2);

for (const url of urls) {
  let html;
  try {
    html = await defaultFetchHtml(url);
  } catch (error) {
    console.log(`\n### ${url}\nFETCH ERROR: ${error.message}`);
    continue;
  }
  console.log(`\n### ${url}  (${html.length} bytes)`);
  const flat = html.replace(/\s+/g, " ");
  const windows = new Set();
  for (const match of flat.matchAll(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}/g)) {
    const start = Math.max(0, match.index - 700);
    windows.add(flat.slice(start, match.index + 120));
  }
  let count = 0;
  for (const window of windows) {
    if (count >= 3) break;
    if (!/<a\s/i.test(window)) continue;
    console.log("-----8<-----\n" + window.slice(-820) + "\n----->8-----");
    count += 1;
  }
}
