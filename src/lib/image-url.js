// 统一的封面图 URL 优化入口：轮播图与卡片都走这里，避免每个组件各写一套图床规则。
//
// 各图床压缩能力（2026-08 按线上真实 URL 实测）：
//  - icitycdn（iMuseum）：URL 路径已自带 /105x105 缩略，≈6KB，原样返回。
//  - img.evbuc.com（Eventbrite）：URL 已自带 w=512&q=75，≈50KB，原样返回。
//  - *.pipi.cn（格瓦拉/猫眼系）：支持 imageMogr2，实测可压缩 ~30%，套缩略+质量参数。
//  - *.meituan.net / file.szmuseum.com：忽略一切 query 参数，全尺寸 PNG（≈1.8MB/3.2MB），
//    只能靠服务端代理（Cloudflare Image Resizing）才能真正压缩——见下方 cloudflare 分支。

const SKIP_HOSTS = [/img\.evbuc\.com\//, /icitycdn\.com\//];

export function optimizedImageUrl(url, { width = 1200, quality = 75 } = {}) {
  if (typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return url;

  // 可选：开启 Cloudflare Image Resizing（付费，需在 zone 后台开启后设置此环境变量）。
  // 开启后所有外链统一走边缘转码（PNG→WebP/AVIF、缩放、压缩），meituan/szmuseum 这类
  // 无法靠 URL 参数压缩的大图才能真正瘦下来。默认关闭，避免未开通时 /cdn-cgi/image 返回 404。
  if (process.env.NEXT_PUBLIC_IMAGE_RESIZER === "cloudflare") {
    return `/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=cover/${trimmed}`;
  }

  if (SKIP_HOSTS.some((pattern) => pattern.test(trimmed))) return url;

  if (/\.pipi\.cn\//.test(trimmed)) {
    return `${trimmed.split("?")[0]}?imageMogr2/thumbnail/${width}x/quality/${quality}`;
  }

  return url;
}

export function isUsableImage(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}
