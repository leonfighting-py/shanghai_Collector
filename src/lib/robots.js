// robots.txt 闸门：抓取前先看目标站是否明示禁止（RFC 9309）
//
// 设计要点：
// 1. 取不到 robots.txt（404 / 超时 / 网络错误 / 非 2xx）→ 视为允许，这是业界标准行为，
//    绝大多数站点没有 robots.txt，不能因此把源池清空。
// 2. 显式 Disallow 命中目标路径 → 拒绝抓取，返回 skipped 让调用方跳过该源。
// 3. 结果按 host 缓存 24h，避免每轮采集都去拉一遍 robots（自身也是请求）。
// 4. 遵守 Crawl-delay：被声明了慢速的主机，在连续请求之间等待。
// 5. 不因 robots 拒绝而静默失败——通过 onDecision 回调把决策暴露给采集日志，
//    便于健康报告区分「源坏了」与「被 robots 拒绝」。

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ROBOTS_TIMEOUT_MS = 10_000;
const MAX_ROBOTS_BYTES = 500_000; // 超过视为异常，视为允许

/** host -> { fetchedAt, rules, crawlDelay } */
const cache = new Map();

function normalizeHost(host) {
  return String(host || "").replace(/^www\./, "").toLowerCase();
}

/** robots 路径片段匹配：支持 * 通配与 $ 结尾锚点 */
function pathMatches(pattern, pathname) {
  if (!pattern) return false;
  // 结尾的 $ 是"锚到路径末尾"的语法标记，先摘出来避免被当成字面量转义
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  let rx = "";
  for (const ch of body) {
    if (ch === "*") rx += ".*";
    else if ("\\^$.*+?()[]{}|".includes(ch)) rx += "\\" + ch;
    else rx += ch;
  }
  if (anchored) rx += "$";
  try {
    return new RegExp("^" + rx).test(pathname);
  } catch {
    return false;
  }
}

/**
 * 解析 robots.txt，取 * 组（无 * 组则取第一个组）。
 * 返回 { disallow:[], allow:[], crawlDelay:number|null } 或 null
 */
export function parseRobots(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const lines = text.split(/\r?\n/);
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();

    if (key === "user-agent") {
      // 连续的 user-agent 行属于同一组
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow") current.disallow.push(val);
    else if (key === "allow") current.allow.push(val);
    else if (key === "crawl-delay") {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) current.crawlDelay = n;
    }
  }

  if (!groups.length) return null;
  const star = groups.find((g) => g.agents.includes("*"));
  return star || groups[0];
}

/** 目标路径是否被禁止（Allow 优先，语义同主流实现） */
export function isPathDisallowed(rules, pathname) {
  if (!rules) return false;
  for (const a of rules.allow) {
    if (a && pathMatches(a, pathname)) return false;
  }
  for (const d of rules.disallow) {
    if (!d) continue; // 空 Disallow 表示"不限制全部"
    if (pathMatches(d, pathname)) return true;
  }
  return false;
}

async function loadRobots(origin, fetchImpl) {
  const now = Date.now();
  const hit = cache.get(origin);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) return hit;

  let entry = { fetchedAt: now, rules: null, crawlDelay: null };
  try {
    const response = await fetchImpl(`${origin}/robots.txt`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; NewsCollectorBot/1.0)", accept: "text/plain,*/*" },
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      redirect: "follow",
    });
    if (response.ok) {
      const text = await response.text();
      if (text.length <= MAX_ROBOTS_BYTES) {
        const rules = parseRobots(text);
        entry = { fetchedAt: now, rules, crawlDelay: rules?.crawlDelay ?? null };
      }
    }
    // 404 / 403 / 5xx 一律保持 rules:null = 视为允许
  } catch {
    // 网络错误、超时 → 同样视为允许
  }

  cache.set(origin, entry);
  return entry;
}

// 同一主机的连续请求之间，按 Crawl-delay 等待
const lastHitAt = new Map();

/**
 * robots 闸门。
 * @returns {Promise<{ allowed:boolean, reason?:string, crawlDelay?:number|null }>}
 */
export async function checkRobots(url, { fetchImpl = fetch, onDecision } = {}) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return { allowed: true };
  }
  const origin = target.origin;
  const { rules, crawlDelay } = await loadRobots(origin, fetchImpl);

  if (crawlDelay) {
    const prev = lastHitAt.get(origin) || 0;
    const wait = prev + crawlDelay * 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 30_000)));
    lastHitAt.set(origin, Date.now());
  }

  if (isPathDisallowed(rules, target.pathname)) {
    const decision = { allowed: false, reason: "robots_disallow", crawlDelay: crawlDelay ?? null };
    if (typeof onDecision === "function") onDecision(url, decision);
    return decision;
  }
  if (typeof onDecision === "function") onDecision(url, { allowed: true, crawlDelay: crawlDelay ?? null });
  return { allowed: true, crawlDelay: crawlDelay ?? null };
}

/** 仅供测试：清空缓存 */
export function __resetRobotsCache() {
  cache.clear();
  lastHitAt.clear();
}
