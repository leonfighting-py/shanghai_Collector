import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 小程序「代码包体检」的图片/音频体积护栏。
 *
 * 来源：微信开发者工具上传前的「代码包」体检项 ——
 *   「图片和音频资源大小应不超过 200 K」
 * 2026-10-06 这项挂了（拦住了上传）：9 个图片资源合计 206.92 KB，
 * 其中首页出血封面 assets/cover.jpg 就占 182.28 KB。
 * 修法是把封面从 1000×666 重采到 900×599、JPEG 质量 78（152.16 KB），
 * 合计降到 176.80 KB。**不是哪个文件单独超标，是总和超标**，
 * 所以这里断言的是总和，单文件阈值另有官方规定（见下）。
 *
 * 出问题时的正确修法（按优先级）：
 *   1. 重采/降质（`sips -Z <宽> -s formatOptions <质量>`）——分辨率优先保住，
 *      因为封面上面还压了一层 scrim 和文字，轻微降质看不出来；
 *   2. 把图挪到 CDN / 云存储，别打进代码包；
 *   3. 删掉没被引用的图（先确认 wxml/wxss/js 里真的没有引用）。
 * 不要为了过体检把封面删掉——它是设计稿的一部分（pages/home/home.wxml 的出血封面）。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MINIPROGRAM_ROOT = resolve(HERE, "..", "miniprogram");

/** 开发者工具体检阈值：图片和音频资源合计不超过 200 K。 */
const TOTAL_BUDGET_BYTES = 200 * 1024;

/** 官方硬限制：tabBar 单个图标不超过 40 KB，否则图标不显示。 */
const TAB_ICON_LIMIT_BYTES = 40 * 1024;

const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function collectAssets() {
  return walk(MINIPROGRAM_ROOT)
    .filter((file) => ASSET_EXTENSIONS.has(extname(file).toLowerCase()))
    .map((file) => ({
      path: relative(MINIPROGRAM_ROOT, file),
      bytes: statSync(file).size,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

test("小程序图片/音频资源合计不超过开发者工具体检的 200 K", () => {
  const assets = collectAssets();
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);

  assert.ok(
    total <= TOTAL_BUDGET_BYTES,
    [
      `图片/音频资源合计 ${formatKb(total)}，超过体检阈值 ${formatKb(TOTAL_BUDGET_BYTES)}` +
        `（超出 ${formatKb(total - TOTAL_BUDGET_BYTES)}）。`,
      "占用最大的几个：",
      ...assets
        .slice(0, 3)
        .map((asset) => `  - ${formatKb(asset.bytes)}  ${asset.path}`),
      "修法见本文件顶部注释（优先「降质/重采」而不是删图）。",
    ].join("\n"),
  );
});

test("tabBar 图标单个不超过 40 KB", () => {
  const oversized = collectAssets()
    .filter((asset) => asset.path.includes(`assets${"/"}tab`))
    .filter((asset) => asset.bytes > TAB_ICON_LIMIT_BYTES);

  assert.deepEqual(
    oversized.map((asset) => `${asset.path} = ${formatKb(asset.bytes)}`),
    [],
    `tabBar 图标超过官方 40 KB 上限会导致图标不显示：\n${oversized
      .map((asset) => `  - ${formatKb(asset.bytes)}  ${asset.path}`)
      .join("\n")}`,
  );
});

test("首页出血封面存在且没有被压糊", () => {
  const assets = collectAssets();
  const cover = assets.find((asset) => asset.path.endsWith("assets/cover.jpg"));

  assert.ok(cover, "miniprogram/assets/cover.jpg 不存在——它是首页出血封面，不能删");
  // 只守下限：低于 40 KB 说明压过头了（封面是 1000px 级插画，糊了很难看）。
  // **上限不在这里守** —— 那是「合计不超过 200 K」那条的职责，
  // 两条断言同一个量、结论还可能互相矛盾，属于坏味道。
  assert.ok(
    cover.bytes >= 40 * 1024,
    `封面只有 ${formatKb(cover.bytes)}，压过头了：` +
      "它在 2x/3x 屏上出血铺满，重采时优先保宽度、再降质量。",
  );
});
