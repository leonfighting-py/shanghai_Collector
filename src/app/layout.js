import "./styles.css";

export const metadata = {
  title: "上海每周活动雷达",
  description: "自动聚合上海本周演出、展览、线下活动和高校公开讲座。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

