#!/usr/bin/env node

import { validateWechatExporterAuth, getWechatExporterConfig, fetchArticlesFromWechatExporter } from "../src/lib/wechat-exporter.js";

const config = getWechatExporterConfig();

if (!config.enabled) {
  console.error("请在 .env 中配置：");
  console.error("  WECHAT_EXPORTER_BASE_URL=http://localhost:3000");
  console.error("  WECHAT_EXPORTER_AUTH_KEY=登录后在 exporter 的 API 页复制");
  console.error("  WECHAT_EXPORTER_ACCOUNTS=公众号A,公众号B");
  process.exit(1);
}

const auth = await validateWechatExporterAuth(config);
console.log(auth.ok ? "✓" : "✗", auth.message);

if (!auth.ok) {
  console.error("\n请打开 http://localhost:3000 ，用你自己的公众号扫码登录，然后在 API 页面复制 X-Auth-Key。");
  process.exit(1);
}

const articles = await fetchArticlesFromWechatExporter(config);
console.log(`\n拉取到 ${articles.length} 篇文章：`);
for (const article of articles.slice(0, 10)) {
  console.log(`- [${article.account_name}] ${article.title}`);
}
if (articles.length > 10) {
  console.log(`... 还有 ${articles.length - 10} 篇`);
}
