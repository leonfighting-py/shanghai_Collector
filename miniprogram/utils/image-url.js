// 封面图 URL 优化的小程序端版本 —— 是 src/lib/image-url.js 的子集。
//
// 为什么要有第二份：小程序不支持 ESM，也拿不到 process.env，
// 而 web 那份有 Cloudflare Image Resizing 分支（`/cdn-cgi/image/...` 需要站点域）。
// 这里只保留「改图床 URL 参数」的部分，逻辑与 web 保持一致。
// ⚠️ 改 web 版的白名单或图床规则时，这里要同步；test/miniprogram-share.test.js 守着关键规则。
//
// 各图床能力（与 web 版同源，2026-08 实测）：
//   icitycdn / img.evbuc.com —— 已自带缩略，原样返回
//   *.pipi.cn —— 支持 imageMogr2/thumbnail 参数
//   其它（meituan.net、file.szmuseum.com 等）—— 忽略 query，改不动，原样返回
//
// 关于「5:4 且小于 128 KB」：URL 参数只能缩宽，裁切由微信自己做（卡片按 5:4 裁）。
// 字节数取决于源图，这里只能尽量压，不能保证。

const SKIP_HOSTS = [/img\.evbuc\.com\//, /icitycdn\.com\//];

function optimizedImageUrl(url, { width = 500, quality = 75 } = {}) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";

  if (SKIP_HOSTS.some((pattern) => pattern.test(trimmed))) return trimmed;

  if (/\.pipi\.cn\//.test(trimmed)) {
    return `${trimmed.split("?")[0]}?imageMogr2/thumbnail/${width}x/quality/${quality}`;
  }

  return trimmed;
}

module.exports = { SKIP_HOSTS, optimizedImageUrl };
