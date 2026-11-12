// 动态信源 —— 由环境变量展开的条目（原 SOURCE_SEEDS_RAW 数组末尾的两个 spread 片段）。
// 2026-11-11 WP1 从 collector.js 搬出，逻辑原样，只是从数组内联 spread 改成了函数：
// sources/index.js 在静态信源之后追加这两个函数的结果，与拆分前的数组位置一致。
import { PARSERS } from "../../parsers/index.js";

// 公众号源：仅当配置了 WECHAT_EVENTS_API_URL（中间层 API）或
// WECHAT_EXPORTER_AUTH_KEY（私有部署 wechat-exporter）时注册。
export function wechatDynamicSources() {
  return process.env.WECHAT_EVENTS_API_URL || process.env.WECHAT_EXPORTER_AUTH_KEY
    ? [
        {
          name: "微信公众号活动",
          url: process.env.WECHAT_EVENTS_API_URL || process.env.WECHAT_EXPORTER_BASE_URL || "http://localhost:3001",
          category: process.env.WECHAT_DEFAULT_CATEGORY || "线下活动",
          locale: "zh",
          parser: PARSERS.wechat,
          timeoutMs: 180_000,
        },
      ]
    : [];
}

// X（Twitter）账号时间线：仅当同时配置 X_BEARER_TOKEN 与 X_SHANGHAI_ACCOUNTS 时注册。
// 注意 api.x.com 在境内不可达，需把采集跑在境外出口的环境（见 x-timeline.js 注释）。
export function xTimelineDynamicSources() {
  return process.env.X_BEARER_TOKEN && process.env.X_SHANGHAI_ACCOUNTS
    ? String(process.env.X_SHANGHAI_ACCOUNTS)
        .split(",")
        .map((handle) => handle.trim())
        .filter(Boolean)
        .map((handle) => ({
          name: `X @${handle}`,
          url: `https://x.com/${handle}`,
          category: process.env.X_DEFAULT_CATEGORY || "线下活动",
          locale: "en",
          parser: PARSERS.xTimeline,
          xHandle: handle,
          defaultVenue: "上海",
        }))
    : [];
}
