// 详情页字段提取：地址、票价、是否免费。纯函数，不发请求，方便单测与探测脚本复用。
//
// 优先 JSON-LD（结构化、来源可靠），其次正文正则（噪声大，规则必须保守）。
// **抓不到就返回 null，不猜。** null 表示「不知道」，不等于免费或大众票价。

const JSON_LD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** 去掉标签后的纯文本，用于正则。保留换行，句读判断要用 */
export function toPlainText(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|td|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function collectJsonLdNodes(html) {
  const nodes = [];
  for (const match of String(html).matchAll(JSON_LD_RE)) {
    let data;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const queue = [data];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      nodes.push(node);
      if (Array.isArray(node["@graph"])) queue.push(...node["@graph"]);
      // 常见包装：mainEntity / itemListElement
      if (node.mainEntity) queue.push(node.mainEntity);
      if (Array.isArray(node.itemListElement)) queue.push(...node.itemListElement);
    }
  }
  return nodes;
}

function isEventNode(node) {
  const type = node?.["@type"];
  if (Array.isArray(type)) return type.includes("Event");
  return type === "Event";
}

/** JSON-LD 里的第一个 Event 节点；没有就 null */
export function extractJsonLdEvent(html) {
  return collectJsonLdNodes(html).find(isEventNode) || null;
}

function joinAddress(address) {
  if (!address) return "";
  if (typeof address === "string") return address.trim();
  if (typeof address === "object") {
    const parts = [
      address.addressCountry,
      address.addressRegion,
      address.addressLocality,
      address.streetAddress,
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);
    return parts.join("") || (typeof address.name === "string" ? address.name.trim() : "");
  }
  return "";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : null;
}

/** 从一个 Offer（可能是数组）里取最低价与最高价 */
function priceFromOffers(offers) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  const prices = [];
  for (const offer of list) {
    if (!offer || typeof offer !== "object") continue;
    const low = toNumber(offer.lowPrice ?? offer.price);
    const high = toNumber(offer.highPrice ?? offer.price);
    if (low !== null) prices.push(low);
    if (high !== null) prices.push(high);
  }
  if (prices.length === 0) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// 「地址：xxx」标签式写法；只取到标点或换行为止
const ADDRESS_LABEL_RE = /(?:地[ \t]*址|场馆地址|演出地址|活动地址)[ \t]*[：:][ \t]*([^\n]{4,80})/;
// 结构式写法：上海市 X 区 Y 路 123 号（区、路、门牌三段都要有，避免抓半截）。
// 各段之间允许空格：页面里常写成「南京东路 100 号」。
const ADDRESS_SHAPE_RE =
  /(?:上海市?)?\s*[\u4e00-\u9fa5]{2,8}(?:区|县)\s*[\u4e00-\u9fa5\d]{1,20}(?:路|街|道|弄|大道)[\u4e00-\u9fa5\d\-]{0,12}\s*\d{1,4}\s*号/;

/** 详情页里的街道地址；没有就 "" */
export function extractAddress(html) {
  const text = toPlainText(html);
  const shape = ADDRESS_SHAPE_RE.exec(text);
  if (shape) return shape[0].trim();

  const label = ADDRESS_LABEL_RE.exec(text);
  if (!label) return "";
  // 标签后面常跟着营业时间/电话，切掉
  return label[1].split(/[。；;|｜，,]/)[0].trim();
}

// 票价：¥/￥ 前缀 与「N 元」两种写法。只认带货币符号或带「票价/价格」字样的上下文，
// 否则页面上「满 100 元包邮」「时长 90 分钟」这类数字会被误当成票价。
// 「¥80-680」这种区间写法要一起吃掉，只取前一个数会把最高价算成 80。
const YUAN_SIGN_RE = /[¥￥]\s*(\d{1,5}(?:\.\d{1,2})?)(?:\s*[-~—至]\s*(\d{1,5}(?:\.\d{1,2})?))?/g;
// 一群数字共用一个「元」：票价：180 / 280 / 380 元。整串先抓下来再拆，别只留最后一个
const YUAN_WORD_RE = /(\d{1,5}(?:\.\d{1,2})?(?:\s*[/／、,，]\s*\d{1,5}(?:\.\d{1,2})?)*)\s*元/g;
const PRICE_CONTEXT_RE = /(票[价务]|价格|售价|全价|预售|学生票|早鸟|票价区间|元起)/;

export function extractPrice(html) {
  const text = toPlainText(html);
  const signed = [];
  for (const match of text.matchAll(YUAN_SIGN_RE)) {
    if (match[1]) signed.push(Number(match[1]));
    if (match[2]) signed.push(Number(match[2]));
  }
  if (signed.length > 0) {
    return { min: Math.min(...signed), max: Math.max(...signed) };
  }

  // 没有货币符号时，只有同一句里出现「票价/价格」才采信
  const cents = [];
  for (const match of text.matchAll(YUAN_WORD_RE)) {
    const start = Math.max(0, match.index - 24);
    const context = text.slice(start, match.index + match[0].length + 8);
    if (!PRICE_CONTEXT_RE.test(context)) continue;
    for (const piece of match[1].split(/[^\d.]+/)) {
      if (piece) cents.push(Number(piece));
    }
  }
  if (cents.length === 0) return { min: null, max: null };
  return { min: Math.min(...cents), max: Math.max(...cents) };
}

// 「免费」的强形态；单写「免费」也算，但要看同一句有没有限定
const FREE_RE = /免费|免票|无需门票|免门票/;
// 限定词：这类「免费」描述的是特定人群或特定服务，不代表这场活动免费
const FREE_QUALIFIER_RE =
  /(儿童|学生|老人|长者|会员|残疾人|军人|医护|1\.2\s*米|1\.3\s*米|身高|随行|陪同|免费停车|免费寄存|免费接驳|免费Wi-?Fi|免费饮料|免费茶点|免费导览|免费租借)/i;

/**
 * 是否免费：只有整句都在说这件事才算。
 * @returns {boolean|null} null = 没提到，false = 提到但不成立（有限定），true = 免费
 */
export function extractFreeFlag(html) {
  const text = toPlainText(html);
  if (!FREE_RE.test(text)) return null;

  const sentences = text.split(/[。！？!?\n]/);
  let sawQualified = false;
  for (const sentence of sentences) {
    if (!FREE_RE.test(sentence)) continue;
    if (FREE_QUALIFIER_RE.test(sentence)) {
      sawQualified = true;
      continue;
    }
    return true;
  }
  return sawQualified ? false : null;
}

/**
 * 一次抽完四个字段。provenance 记录每个字段的来源（detjson=json-ld / regex=正文正则），
 * 便于事后按层统计贡献、定位错误源头。
 */
export function extractFacets(html) {
  const jsonLd = extractJsonLdEvent(html);
  const provenance = {};

  let address = "";
  let priceMin = null;
  let priceMax = null;
  let isFree = null;
  let venue = "";

  if (jsonLd) {
    venue = typeof jsonLd.location?.name === "string" ? jsonLd.location.name.trim() : "";
    address = joinAddress(jsonLd.location?.address);
    if (address) provenance.address = "jsonld";

    const price = priceFromOffers(jsonLd.offers);
    if (price.min !== null || price.max !== null) {
      priceMin = price.min;
      priceMax = price.max;
      provenance.price = "jsonld";
    }

    if (typeof jsonLd.isAccessibleForFree === "boolean") {
      isFree = jsonLd.isAccessibleForFree;
      provenance.is_free = "jsonld";
    }
  }

  if (!address) {
    const found = extractAddress(html);
    if (found) {
      address = found;
      provenance.address = "regex";
    }
  }

  if (priceMin === null && priceMax === null) {
    const price = extractPrice(html);
    if (price.min !== null || price.max !== null) {
      priceMin = price.min;
      priceMax = price.max;
      provenance.price = "regex";
    }
  }

  if (isFree === null) {
    const free = extractFreeFlag(html);
    if (free !== null) {
      isFree = free;
      provenance.is_free = "regex";
    }
  }

  return {
    venue,
    address,
    price_min: priceMin,
    price_max: priceMax,
    is_free: isFree,
    provenance,
    has_json_ld_event: Boolean(jsonLd),
  };
}
