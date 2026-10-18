// 境外源的出口代理：只在 Node 进程里初始化（Cloudflare Workers 侧不会 import 这个文件）。
//
// 背景：Eventbrite / 活动行 / Meetup / Lu.ma / AllEvents 在腾讯云 runner 上返回 403/405，
// 同一 URL 换住宅 IP 或境外出口就是 200 —— 拦的是出口 IP，不是页面。三条可行路线见 docs/offshore-sources.md，
// 这里只负责「让采集器认代理」这一层：
//
//   OUTBOUND_PROXY=http://127.0.0.1:7890            # Clash / mihomo / Squid / 商业代理
//   OUTBOUND_PROXY_HOSTS=eventbrite.com,meetup.com  # 只让这些域名走代理（推荐，国内源继续直连）
//
// ⚠️ 不要读 HTTP_PROXY / HTTPS_PROXY：WorkBuddy 沙箱会预置成自己的内网代理，连不上外网。

import { configureOutboundProxy } from "./proxy-registry.js";

export async function initOutboundProxy() {
  const proxyUrl = String(process.env.OUTBOUND_PROXY || "").trim();
  if (!proxyUrl) return "disabled";

  const hosts = String(process.env.OUTBOUND_PROXY_HOSTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  try {
    const { ProxyAgent } = await import("undici");
    configureOutboundProxy({
      proxyUrl,
      hosts,
      createAgent: (target) => new ProxyAgent(target),
    });
    return hosts.length > 0 ? `enabled(${proxyUrl}; hosts=${hosts.join("|")})` : `enabled(${proxyUrl}; all)`;
  } catch (error) {
    // 没有 undici（未装依赖）时不要静默降级成「以为走代理其实直连」
    throw new Error(`OUTBOUND_PROXY 已设置，但加载 undici 失败：${error instanceof Error ? error.message : error}`);
  }
}
