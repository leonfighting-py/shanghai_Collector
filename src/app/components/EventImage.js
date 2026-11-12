"use client";

import { useState } from "react";

import { isUsableImage, optimizedImageUrl, pickReferrerPolicy } from "../../lib/image-url.js";

/**
 * 活动封面。无图 / 裂图时返回 fallback（默认什么都不渲染）——
 * 新版式里没有图的活动只显示文字，不再用灰色占位块顶位置。
 */
export function EventImage({ url, width = 600, fallback = null }) {
  const [failed, setFailed] = useState(false);
  if (!isUsableImage(url) || failed) return fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={optimizedImageUrl(url, { width })}
      alt=""
      loading="lazy"
      referrerPolicy={pickReferrerPolicy(url)}
      onError={() => setFailed(true)}
    />
  );
}
