import { getSiteUrl } from "../lib/site-url.js";
import "./styles.css";

export const metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "上海近两日活动精选",
  description: "每两日更新上海演出、展览、线下活动和高校公开讲座精选。",
  alternates: {
    types: {
      "application/rss+xml": `${getSiteUrl()}/feed.xml`,
    },
  },
};

// 深浅色完全跟随系统（prefers-color-scheme），不再提供手动切换，见 styles.css 顶部的 token
export const viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#201f1d" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
