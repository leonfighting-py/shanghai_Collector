// 活动稳定标识 slug：放进 URL、做收藏键、做 ICS 的 UID。
//
// 为什么不用 dedupe_key：dedupe_key = 标题|上海日期|场馆，而标题会被 LLM 富化改写
//（src/lib/event-enrichment.js 的 applyEnrichment 改完标题会重算 dedupe_key）。
// 拿它当收藏键，标题一改收藏就丢；拿它做 URL，同一场活动会留下好几个地址。
//
// slug 只依赖「首个来源 URL + 上海开始日期 + 场馆」——富化不碰这三个字段，
// 所以同一场活动跨轮采集 slug 不变。代价是源站改了 URL 或改了日期时会换 slug，
// 这属于活动本身变了，可以接受。
//
// 哈希用 sha1 而不是 node:crypto：这个文件会被复制进小程序云函数
//（miniprogram/cloudfunctions/events/lib/event-slug.mjs），也要能在 Workers 里跑，
// 不能依赖 Node 内置模块。

// Crockford base32：去掉了 i l o u，避免手抄/口述时认错
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const SLUG_LENGTH = 10;

function rotl(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function utf8Bytes(text) {
  const bytes = [];
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** sha1 摘要（20 字节）。只用于生成短标识，不用于任何安全用途。 */
export function sha1Bytes(text) {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 长度按 64 位大端写；超过 2^32 位（512 MB）的输入不存在，高 32 位恒为 0
  bytes.push(0, 0, 0, 0);
  bytes.push((bitLength >>> 24) & 0xff, (bitLength >>> 16) & 0xff, (bitLength >>> 8) & 0xff, bitLength & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array(80);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      w[index] =
        (bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3];
    }
    for (let index = 16; index < 80; index += 1) {
      w[index] = rotl(w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f;
      let k;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[index]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].flatMap((word) => [
    (word >>> 24) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 8) & 0xff,
    word & 0xff,
  ]);
}

export function encodeBase32(bytes, length = SLUG_LENGTH) {
  let buffer = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffffffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out.slice(0, length);
}

/**
 * URL 规范化：只做「同一页面不同写法」的归一，不做内容级清洗。
 * 去协议、去 www、去锚点、去结尾斜杠，主机小写；路径保留大小写（可能真的是不同的页），
 * 查询串保留（票务站常用 ?id= 区分不同场次）。
 */
export function normalizeUrlForSlug(url) {
  const text = String(url || "").trim().replace(/#.*$/, "");
  if (!text) return "";
  const match = text.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]+)([^?#]*)(\?[^#]*)?$/i);
  if (!match) return text.toLowerCase();
  const host = match[1].toLowerCase().replace(/^www\./, "");
  const path = (match[2] || "").replace(/\/+$/, "");
  return `${host}${path}${match[3] || ""}`;
}

/**
 * 单条活动的 slug。入参只需要这条活动自己的字段，所以采集侧和读路径算出的结果一致。
 *
 * 场馆进哈希是为了分开「同一篇目录页里的多场活动」：gov-weekly 这类解析器会把
 * 一篇「本周活动一览」展开成 10–40 条，它们的 signup_url 完全相同，只靠 URL + 日期
 * 会把同一天同一场馆的两场讲座算成同一个 slug。
 */
export function buildEventSlug(event) {
  const url = normalizeUrlForSlug(event?.source_url) || normalizeUrlForSlug(event?.signup_url);
  const date = shanghaiDayOf(event?.start_time);
  const venue = normalizeKey(event?.venue);
  const seed = `${url}|${date}|${venue}`;
  return encodeBase32(sha1Bytes(seed), SLUG_LENGTH);
}

// 与 events.js 的 normalizeText 同义，只是不剥标点：这个文件被 events.js 反向依赖，
// 不能 import 它（会成环），所以自己带一份。
function normalizeKey(value = "") {
  return String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function shanghaiDayOf(input) {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 给一批活动分配 slug。base 撞了才加 `-2`、`-3` 后缀。
 *
 * 为什么允许撞：base 是 50 位哈希，正常活动不会撞；真撞了只可能是上面说的
 * 同页同日同场馆的不同场次，此时两行必须能各自成页。后缀只在同一批数据里分配，
 * 所以同一批输入永远得到同一组 slug。
 */
export function assignSlugs(events) {
  const seen = new Map();
  return events.map((event) => {
    const base = buildEventSlug(event);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return { ...event, slug: count === 1 ? base : `${base}-${count}` };
  });
}
