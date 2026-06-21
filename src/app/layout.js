import "./styles.css";

export const metadata = {
  title: "上海近两日活动精选",
  description: "每两日更新上海演出、展览、线下活动和高校公开讲座精选。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
