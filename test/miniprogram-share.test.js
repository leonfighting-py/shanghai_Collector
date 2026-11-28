import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 小程序端是 CommonJS，这里复制到临时 CJS 目录再 require（同 miniprogram-reminders.test.js 的做法）。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-share-"));
fs.mkdirSync(path.join(workdir, "utils"));
fs.writeFileSync(path.join(workdir, "package.json"), JSON.stringify({ type: "commonjs" }));
for (const file of ["image-url.js", "format.js"]) {
  fs.copyFileSync(path.join(root, "miniprogram/utils", file), path.join(workdir, "utils", file));
}
const requireCjs = createRequire(path.join(workdir, "probe.cjs"));
const imageUrl = requireCjs(path.join(workdir, "utils/image-url.js"));
const format = requireCjs(path.join(workdir, "utils/format.js"));

test.after(() => fs.rmSync(workdir, { recursive: true, force: true }));

test("pipi.cn 图床加缩略参数，控制卡片图片体积", () => {
  const out = imageUrl.optimizedImageUrl("https://img.pipi.cn/poster/abc.jpg", { width: 500 });
  assert.equal(out, "https://img.pipi.cn/poster/abc.jpg?imageMogr2/thumbnail/500x/quality/75");
});

test("已自带缩略的图床原样返回，不重复加参数", () => {
  const icity = "https://static.icitycdn.com/x/105x105/cover.jpg";
  assert.equal(imageUrl.optimizedImageUrl(icity), icity);
  const evbuc = "https://img.evbuc.com/abc?w=512&q=75";
  assert.equal(imageUrl.optimizedImageUrl(evbuc), evbuc);
});

test("改不动参数的图床原样返回（不要拼错 URL 导致 404）", () => {
  const url = "https://p0.meituan.net/event/1.8mb.png";
  assert.equal(imageUrl.optimizedImageUrl(url), url);
});

test("空值与非 http 地址返回空串（分享卡片宁可无图，也不要坏 URL）", () => {
  assert.equal(imageUrl.optimizedImageUrl(""), "");
  assert.equal(imageUrl.optimizedImageUrl(null), "");
  assert.equal(imageUrl.optimizedImageUrl("/local/path.png"), "");
});

test("白名单与 web 版 src/lib/image-url.js 一致", () => {
  const web = fs.readFileSync(path.join(root, "src/lib/image-url.js"), "utf8");
  for (const pattern of [/img\\\.evbuc\\\.com\\\//, /icitycdn\\\.com\\\//, /\\\.pipi\\\.cn\\\//]) {
    assert.match(web, pattern, `web 版缺少规则 ${pattern}，小程序端要同步`);
  }
  // 小程序端的正则字符串形式（去掉 JS 转义后比对语义）
  const app = fs.readFileSync(path.join(root, "miniprogram/utils/image-url.js"), "utf8");
  assert.match(app, /img\\\.evbuc\\\.com/);
  assert.match(app, /icitycdn\\\.com/);
  assert.match(app, /\\\.pipi\\\.cn/);
});

test("期号标签与 web 的 issueLabel 同口径：14 天窗口、首尾点号日期", () => {
  assert.equal(format.windowLabel(new Date("2026-11-28T10:00:00+08:00")), "2026 · 11.28 — 12.11");
  // 跨年：年份取窗口起始那一年
  assert.equal(format.windowLabel(new Date("2026-12-25T10:00:00+08:00")), "2026 · 12.25 — 01.07");
});

test("期号按上海日期算，不随本地时区漂移", () => {
  // UTC 11-28 20:00 = 上海 11-29 04:00
  assert.equal(format.windowLabel(new Date("2026-11-28T20:00:00Z")), "2026 · 11.29 — 12.12");
});
