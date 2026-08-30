import { ThemeProvider } from "./components/ThemeProvider.js";
import "./styles.css";

export const metadata = {
  title: "上海近两日活动精选",
  description: "每两日更新上海演出、展览、线下活动和高校公开讲座精选。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Prevent theme flash: set data-theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme")||"dark";document.documentElement.setAttribute("data-theme",t);})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
