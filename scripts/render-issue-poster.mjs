// 期刊分享海报：1080×1920 竖版长图，存到 GitHub Release，页面通过
// /issue/[date]/poster.png 302 过去。
//
// 为什么不用 next/og：Workers 里要跑 satori + resvg-wasm，中文字体还得整份打进 worker
// （CJK 字体 3~8 MB，会撞体积上限）。改成在 Node 里用 Chromium 渲染 HTML 截图，
// 字体用系统 Noto CJK，产物是一张 PNG，跟 worker 体积无关。
//
// 用法：
//   node --env-file=.env scripts/render-issue-poster.mjs                # 渲染最新一期
//   node --env-file=.env scripts/render-issue-poster.mjs 2026-11-26     # 指定日期
//   node --env-file=.env scripts/render-issue-poster.mjs --snapshot=./s.json  # 用本地快照（不连库）
//
// 产物：out/poster-YYYY-MM-DD.png

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";
import { chromium } from "playwright";

import { getIssue, listIssues } from "../src/lib/issues.js";
import { formatCardTime } from "../src/lib/agenda.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "out");
const SITE_URL = process.env.SITE_URL || "https://news.leoncoooolest.com";

const dateArg = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const snapshotArg = process.argv.find((arg) => arg.startsWith("--snapshot="));

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

async function loadIssue() {
  if (snapshotArg) {
    const file = path.resolve(snapshotArg.split("=")[1]);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  let date = dateArg;
  if (!date) {
    const latest = await listIssues({ limit: 1 });
    if (latest.length === 0) throw new Error("库里没有任何一期，先跑一轮采集或手动写一期");
    date = latest[0].date;
  }
  const issue = await getIssue(date);
  if (!issue) throw new Error(`找不到 ${date} 这一期`);
  return issue;
}

function posterHtml(issue, qrDataUrl) {
  const items = issue.highlights.slice(0, 5);
  const stats = issue.stats || {};
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    background: #fbfaf7; color: #191817;
    font-family: "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif;
    display: flex; flex-direction: column;
    padding: 96px 88px 72px;
  }
  .sans { font-family: "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif; }
  .top { display: flex; align-items: baseline; justify-content: space-between; }
  .brand { font-size: 30px; letter-spacing: .22em; }
  .date { font-size: 26px; color: #5f5d59; letter-spacing: .08em; }
  .rule { height: 1px; background: #191817; opacity: .85; margin: 28px 0 0; }
  .label { margin-top: 44px; font-size: 64px; line-height: 1.25; letter-spacing: .02em; }
  .label small { display: block; font-size: 26px; color: #5f5d59; letter-spacing: .18em; margin-bottom: 18px;
    font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  .list { margin-top: 48px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
  .item { padding: 26px 0 24px; border-top: 1px solid rgba(25,24,23,.16); display: flex; gap: 28px; }
  .no { flex: none; width: 92px; font-size: 26px; color: #c4472a; letter-spacing: .06em; padding-top: 6px;
    font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  .body { min-width: 0; }
  .cat { font-size: 22px; color: #918e89; letter-spacing: .16em; font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  .title { margin-top: 12px; font-size: 42px; line-height: 1.32; letter-spacing: .01em;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { margin-top: 14px; font-size: 24px; color: #5f5d59;
    font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; padding-top: 30px; }
  .stats { font-size: 24px; color: #5f5d59; line-height: 1.7;
    font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; }
  .stats b { font-size: 40px; font-weight: 500; color: #191817; margin-right: 8px; }
  .qr { flex: none; text-align: center; }
  .qr img { width: 168px; height: 168px; display: block; }
  .qr span { display: block; margin-top: 10px; font-size: 22px; color: #918e89;
    font-family: "PingFang SC", "Noto Sans CJK SC", sans-serif; }
</style></head>
<body>
  <div class="top">
    <span class="brand">上海活动雷达</span>
    <span class="date sans">${escapeHtml(issue.label)}</span>
  </div>
  <div class="rule"></div>

  <div class="label">
    <small>本期精选</small>
    未来两周，${items.length} 场值得去
  </div>

  <div class="list">
    ${items
      .map(
        (item, index) => `<div class="item">
      <div class="no">N° ${String(index + 1).padStart(2, "0")}</div>
      <div class="body">
        <div class="cat">${escapeHtml(item.category || "")}</div>
        <div class="title">${escapeHtml(item.title || "")}</div>
        <div class="meta">${escapeHtml(formatCardTime(item))} · ${escapeHtml(item.venue || "")}</div>
      </div>
    </div>`,
      )
      .join("")}
  </div>

  <div class="bottom">
    <div class="stats">
      <div><b>${stats.upcoming ?? 0}</b>场即将开始 · <b>${stats.ongoing ?? 0}</b>场正在进行</div>
      <div>${stats.venues ?? 0} 个场馆 · 每两日更新</div>
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="扫码看本期" />
      <span>扫码看本期</span>
    </div>
  </div>
</body></html>`;
}

async function main() {
  const issue = await loadIssue();
  const targetUrl = `${SITE_URL}/issue/${issue.date}`;
  const qrDataUrl = await QRCode.toDataURL(targetUrl, { margin: 1, width: 336, errorCorrectionLevel: "M" });

  const html = posterHtml(issue, qrDataUrl);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(OUT_DIR, `poster-${issue.date}.png`);
  await page.screenshot({ path: out, type: "png" });
  await browser.close();

  const { size } = fs.statSync(out);
  console.log(`海报：${path.relative(root, out)}（${(size / 1024).toFixed(0)} KB，${size > 1024 * 1024 ? "超过 1 MB ⚠️" : "小于 1 MB ✅"}）`);
  console.log(`二维码指向：${targetUrl}`);
  if (size > 1024 * 1024) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
