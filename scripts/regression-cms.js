// 回归对比：对使用 cnCmsLectures 的源，比较开启/关闭通用锚点扫描时的召回量差异（只读）
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { parseCnCmsLectures } from "../src/lib/parsers/cn-cms-lectures.js";

const SOURCES = JSON.parse(process.env.REGRESSION_SOURCES);

async function mapLimit(items, limit, mapper) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(mapper))));
  }
  return out;
}

const rows = await mapLimit(SOURCES, 5, async (source) => {
  try {
    const html = await defaultFetchHtml(source.url);
    const off = await parseCnCmsLectures(html, source, { fetchHtml: defaultFetchHtml, anchorScan: false });
    const on = await parseCnCmsLectures(html, source, { fetchHtml: defaultFetchHtml, anchorScan: true });
    return { name: source.name, off: off.length, on: on.length, error: null };
  } catch (error) {
    return { name: source.name, off: 0, on: 0, error: error.message };
  }
});

console.log("source                                        liOnly  +anchor  delta");
for (const row of rows) {
  const delta = row.on - row.off;
  console.log(
    `${row.name.padEnd(44)} ${String(row.off).padStart(6)} ${String(row.on).padStart(7)} ${String(delta >= 0 ? "+" + delta : delta).padStart(6)}${row.error ? "  ERR " + row.error : ""}`,
  );
}
