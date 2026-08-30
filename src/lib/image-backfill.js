// 图片回填：对采集后仍无封面的事件，抓详情页提取 og:image（或正文首图）。
// 只补无图事件，带并发限制与超时；失败静默跳过（渐变兜底仍生效）。

import { defaultFetchHtml } from "./fetch-html.js";

// 明确的界面/图标图：这类图没有信息量，宁缺毋滥
const JUNK_IMAGE_PATTERN =
  /(logo|icon|avatar|banner\/(nav|top)|favicon|spacer|placeholder|default[_-]?(cover|img|image)|share[_-]?(img|icon)|ico\.)/i;
const JUNK_IMAGE_PATH = /\/(statics?|assets?|img|images?)\/(common|global|default)\//i;

/** og:image / twitter:image / json-LD image / 正文第一张图 */
export function extractDetailImage(html) {
  const og =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] ||
    html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (og && !JUNK_IMAGE_PATTERN.test(og)) return og;

  // JSON-LD Event.image
  const jsonLdImage = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => {
      try {
        const data = JSON.parse(m[1]);
        const image = data?.image || data?.mainEntity?.image;
        if (typeof image === "string") return image;
        if (Array.isArray(image) && image.length > 0) return image[0];
        if (image?.url) return image.url;
      } catch {}
      return null;
    })
    .find(Boolean);
  if (jsonLdImage && !JUNK_IMAGE_PATTERN.test(jsonLdImage)) return jsonLdImage;

  // 正文首图：取第一张非 logo/图标的 jpg/png/webp
  for (const match of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const src = match[1];
    if (!/\.(?:jpg|jpeg|png|webp)(\?|:|\/|$)/i.test(src)) continue;
    if (JUNK_IMAGE_PATTERN.test(src) || JUNK_IMAGE_PATH.test(src)) continue;
    if (src.startsWith("//")) return `https:${src}`;
    return src;
  }

  return null;
}

/**
 * 对无图事件批量回填封面：抓 signup_url，提取 og:image。
 * @param {Array<object>} events
 * @param {{fetchHtml?: Function, limit?: number, concurrency?: number}} options
 */
export async function backfillEventImages(events, { fetchHtml = defaultFetchHtml, limit = 30, concurrency = 4 } = {}) {
  const targets = events
    .filter((event) => !event.image_url && /^https?:\/\//i.test(event.signup_url || ""))
    .slice(0, limit);

  let backfilled = 0;
  let failed = 0;

  for (let index = 0; index < targets.length; index += concurrency) {
    const chunk = targets.slice(index, index + concurrency);
    await Promise.all(
      chunk.map(async (event) => {
        try {
          const html = await fetchHtml(event.signup_url);
          const image = extractDetailImage(html);
          if (image) {
            event.image_url = image;
            backfilled += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }),
    );
  }

  return { attempted: targets.length, backfilled, failed };
}
