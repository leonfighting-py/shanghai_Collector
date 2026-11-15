// 字段探测：确认「详情页到底能不能拿到地址 / 票价 / 是否免费」。
// 这是 docs/plans/2026-10-12-event-facets-backfill.md 的第 1 步，结论决定后面值不值得做。
//
// 用法：
//   npm run facets:probe                          # 从线上 /api/events 取样，20 个信源 × 5 条
//   npm run facets:probe -- --sources=8 --per-source=3
//   node scripts/facets-probe.js --from=/tmp/events.json   # 用本地 JSON（结构同 /api/events）
//
// 只读，不写库。输出：
//   scripts/facets-probe-report.md    按信源一行，给人看
//   scripts/facets-probe-report.json  原始计数，给后面做对比
//
// ⚠️ 限速：单站两次请求间隔 ≥2 秒。2026-10 曾有源一次打 100+ 页把出口 IP 打黑，
// 连坐 14 个源，别再来一次。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractFacets, toPlainText } from "../src/lib/facet-extract.js";
import { defaultFetchHtml } from "../src/lib/fetch-html.js";
import { checkRobots } from "../src/lib/robots.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_MD = path.join(root, "scripts/facets-probe-report.md");
const REPORT_JSON = path.join(root, "scripts/facets-probe-report.json");

const DEFAULT_SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://news.leoncoooolest.com";
const HOST_INTERVAL_MS = 2000;
const HOST_CONCURRENCY = 4;
// 正文短于这个长度基本可以断定是脚本渲染（或抓到了空壳页），正则提取无从下手
const THIN_TEXT_BYTES = 400;

function parseArgs(argv) {
  const options = { sources: 20, perSource: 5, from: "", site: DEFAULT_SITE };
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "sources") options.sources = Number(value) || options.sources;
    else if (key === "per-source") options.perSource = Number(value) || options.perSource;
    else if (key === "from") options.from = value || "";
    else if (key === "site") options.site = value || DEFAULT_SITE;
  }
  return options;
}

async function loadEvents({ from, site }) {
  if (from) {
    const raw = JSON.parse(fs.readFileSync(from, "utf8"));
    return Array.isArray(raw) ? raw : raw.events || [];
  }
  const response = await fetch(`${site.replace(/\/+$/, "")}/api/events`);
  if (!response.ok) throw new Error(`拉取 ${site}/api/events 失败：HTTP ${response.status}`);
  const data = await response.json();
  return data.events || [];
}

/** 重点票务源优先：探测的目的就是回答「票务站详情页有没有票价」 */
const PRIORITY = [/格瓦拉/, /票牛/, /豆瓣/, /大麦/, /猫眼/, /活动行/, /秀动/];

function pickSamples(events, { sources, perSource }) {
  const bySource = new Map();
  for (const event of events) {
    const url = String(event.signup_url || "");
    if (!/^https?:\/\//i.test(url)) continue;
    const name = event.source_name || "（未知来源）";
    if (!bySource.has(name)) bySource.set(name, { name, urls: new Map() });
    bySource.get(name).urls.set(url, event);
  }

  const ordered = [...bySource.values()].sort((left, right) => {
    const rank = (item) => {
      const index = PRIORITY.findIndex((pattern) => pattern.test(item.name));
      return index === -1 ? PRIORITY.length : index;
    };
    return rank(left) - rank(right) || right.urls.size - left.urls.size;
  });

  return ordered.slice(0, sources).map((source) => ({
    name: source.name,
    events: [...source.urls.values()].slice(0, perSource),
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 按主机分组：同一主机串行且间隔 ≥2s，不同主机并行（上限 HOST_CONCURRENCY） */
async function fetchAll(jobs, { fetchHtml, onResult }) {
  const byHost = new Map();
  for (const job of jobs) {
    const host = new URL(job.url).hostname;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(job);
  }

  const hosts = [...byHost.entries()];
  let cursor = 0;

  async function worker() {
    while (cursor < hosts.length) {
      const [host, hostJobs] = hosts[cursor];
      cursor += 1;
      let first = true;
      for (const job of hostJobs) {
        if (!first) await sleep(HOST_INTERVAL_MS);
        first = false;
        await processJob(job, host, fetchHtml, onResult);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(HOST_CONCURRENCY, hosts.length) }, worker));
}

async function processJob(job, host, fetchHtml, onResult) {
  const startedAt = Date.now();
  try {
    const decision = await checkRobots(job.url);
    if (!decision.allowed) {
      onResult(job, { status: "robots_denied", reason: decision.reason });
      return;
    }
    const html = await fetchHtml(job.url);
    const facets = extractFacets(html);
    const text = toPlainText(html);
    onResult(job, {
      status: "ok",
      host,
      facets,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      textBytes: Buffer.byteLength(text, "utf8"),
      thin: Buffer.byteLength(text, "utf8") < THIN_TEXT_BYTES,
      ms: Date.now() - startedAt,
    });
  } catch (error) {
    onResult(job, { status: "failed", reason: error?.message || String(error) });
  }
}

function summarize(samples, results) {
  const rows = [];
  for (const sample of samples) {
    const own = results.filter((item) => item.source === sample.name);
    const ok = own.filter((item) => item.status === "ok");
    const count = (predicate) => ok.filter(predicate).length;
    rows.push({
      source: sample.name,
      sampled: own.length,
      fetched: ok.length,
      failed: own.filter((item) => item.status === "failed").length,
      robotsDenied: own.filter((item) => item.status === "robots_denied").length,
      jsonLd: count((item) => item.facets.has_json_ld_event),
      address: count((item) => Boolean(item.facets.address)),
      price: count((item) => item.facets.price_min !== null || item.facets.price_max !== null),
      free: count((item) => item.facets.is_free !== null),
      freeTrue: count((item) => item.facets.is_free === true),
      thin: count((item) => item.thin),
      avgTextBytes: ok.length
        ? Math.round(ok.reduce((sum, item) => sum + item.textBytes, 0) / ok.length)
        : 0,
      failures: own
        .filter((item) => item.status !== "ok")
        .slice(0, 3)
        .map((item) => `${item.status}: ${item.reason || ""}`),
    });
  }
  return rows;
}

function pct(part, total) {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function buildMarkdown(rows, { site, generatedAt }) {
  const totalFetched = rows.reduce((sum, row) => sum + row.fetched, 0);
  const totalSampled = rows.reduce((sum, row) => sum + row.sampled, 0);
  const sum = (key) => rows.reduce((acc, row) => acc + row[key], 0);

  const lines = [
    "# 字段探测报告",
    "",
    `生成时间：${generatedAt}`,
    `样本来源：${site}/api/events`,
    `样本量：${totalSampled} 条详情页链接，成功抓取 ${totalFetched} 条`,
    "",
    "## 总览",
    "",
    "| 指标 | 抓到的条数 | 占已抓取 |",
    "|---|---|---|",
    `| JSON-LD 里有 Event 结构 | ${sum("jsonLd")} | ${pct(sum("jsonLd"), totalFetched)} |`,
    `| 地址 | ${sum("address")} | ${pct(sum("address"), totalFetched)} |`,
    `| 票价（最低或最高价） | ${sum("price")} | ${pct(sum("price"), totalFetched)} |`,
    `| 免费判定（true 或 false） | ${sum("free")} | ${pct(sum("free"), totalFetched)} |`,
    `| 其中判定为免费 | ${sum("freeTrue")} | ${pct(sum("freeTrue"), totalFetched)} |`,
    `| 正文过短（疑似脚本渲染） | ${sum("thin")} | ${pct(sum("thin"), totalFetched)} |`,
    "",
    "## 按信源",
    "",
    "| 信源 | 样本 | 抓取成功 | JSON-LD | 地址 | 票价 | 免费判定 | 正文过短 | 平均正文字节 |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row) =>
        `| ${row.source} | ${row.sampled} | ${row.fetched} | ${row.jsonLd} | ${row.address} | ${row.price} | ${row.free} | ${row.thin} | ${row.avgTextBytes} |`,
    ),
    "",
  ];

  const failed = rows.filter((row) => row.failed + row.robotsDenied > 0);
  if (failed.length > 0) {
    lines.push("## 抓取失败", "");
    for (const row of failed) {
      lines.push(`- **${row.source}**：失败 ${row.failed}，robots 拒绝 ${row.robotsDenied}`);
      for (const reason of row.failures) lines.push(`  - ${reason}`);
    }
    lines.push("");
  }

  lines.push(
    "## 怎么读这份报告",
    "",
    "- 票价一列接近 0 且「正文过短」很多：这些详情页是脚本渲染的，正则提取拿不到，价格要走接口或放弃。",
    "- JSON-LD 有 Event 但地址/票价为 0：结构在但字段没填，只能靠正文正则。",
    "- 「免费判定」包含 false（明确写了收费，但被人群限定的「儿童免费」也算 false），它也有用：能筛掉误判。",
    "",
  );

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv);
  const events = await loadEvents(options);
  if (events.length === 0) throw new Error("没有拿到任何活动样本");

  const samples = pickSamples(events, options);
  const jobs = [];
  for (const sample of samples) {
    for (const event of sample.events) {
      jobs.push({ source: sample.name, url: event.signup_url, title: event.title });
    }
  }

  console.log(`[probe] ${samples.length} 个信源，${jobs.length} 条详情页，单站间隔 ${HOST_INTERVAL_MS}ms`);

  const results = [];
  let done = 0;
  await fetchAll(jobs, {
    fetchHtml: defaultFetchHtml,
    onResult(job, result) {
      done += 1;
      results.push({ ...job, ...result });
      const mark = result.status === "ok" ? "·" : "!";
      console.log(`[${done}/${jobs.length}] ${mark} ${job.source} ${result.status} ${job.url}`);
    },
  });

  const rows = summarize(samples, results);
  const generatedAt = new Date().toISOString();
  fs.writeFileSync(REPORT_JSON, JSON.stringify({ generatedAt, site: options.site, rows, results }, null, 2));
  fs.writeFileSync(REPORT_MD, buildMarkdown(rows, { site: options.site, generatedAt }));

  const fetched = rows.reduce((sum, row) => sum + row.fetched, 0);
  const sum = (key) => rows.reduce((acc, row) => acc + row[key], 0);
  console.log(
    [
      "",
      `抓取成功 ${fetched}/${jobs.length}`,
      `JSON-LD Event ${sum("jsonLd")}｜地址 ${sum("address")}｜票价 ${sum("price")}｜免费判定 ${sum("free")}｜正文过短 ${sum("thin")}`,
      `报告：${path.relative(root, REPORT_MD)}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
