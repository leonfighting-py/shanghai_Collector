// 出口代理登记表（纯逻辑，不 import 任何 Node 专有模块）。
//
// 为什么绕一层：`fetch-html.js` 同时被 Cloudflare Workers 侧的页面构建引用，
// 直接 `import { ProxyAgent } from "undici"` 会把这个 Node 专有包拖进 Worker 产物。
// 所以这里只保存「已创建好的 dispatcher + 域名白名单」，真正的 undici 导入放在
// `outbound-proxy.js`（只由 Node 侧的采集入口调用）。

let agent = null;
let agentProxyUrl = "";
let allowHosts = [];

/** 由 outbound-proxy.js 在采集进程启动时调用 */
export function configureOutboundProxy({ proxyUrl, hosts = [], createAgent }) {
  const trimmed = String(proxyUrl || "").trim();
  allowHosts = hosts.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  agentProxyUrl = trimmed;
  if (!trimmed || typeof createAgent !== "function") {
    agent = null;
    return;
  }
  if (!agent) agent = createAgent(trimmed);
}

export function resetOutboundProxy() {
  agent = null;
  agentProxyUrl = "";
  allowHosts = [];
}

/** 该 URL 是否应该走代理；没配代理时一律返回 undefined（= 直连，行为与改造前一致） */
export function resolveDispatcher(url) {
  if (!agent) return undefined;
  if (allowHosts.length === 0) return agent;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const matched = allowHosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  return matched ? agent : undefined;
}

export function describeOutboundProxy() {
  if (!agent) return "disabled";
  return allowHosts.length > 0 ? `enabled(${agentProxyUrl}; hosts=${allowHosts.join("|")})` : `enabled(${agentProxyUrl}; all)`;
}
