import { CATEGORIES } from "../../lib/events.js";
import { getSiteUrl } from "../../lib/site-url.js";

export function GET() {
  const base = getSiteUrl();
  const categoryLines = CATEGORIES.map((c) => `- [${c}](${base}/?category=${encodeURIComponent(c)}): 上海${c}精选活动`).join("\n");

  const body = `# 上海近两日活动精选

> 每两日自动聚合上海未来两周的演出、展览、线下活动与高校公开讲座。数据由 GitHub Actions 采集入库，访客页面只读已聚合的结果。

## 站点导航
- 首页（未来 14 天滚动窗口精选）：${base}/
- JSON API（公开）：${base}/api/events
- RSS 订阅：${base}/feed.xml
- 站点地图：${base}/sitemap.xml

## 分类页
${categoryLines}

## 分类说明
- 演出音乐：音乐会、演唱会、话剧、音乐剧、现场演出
- 展览：美术馆、博物馆、画廊展览（含长三角周边）
- 线下活动：市集、论坛、品牌活动、聚会
- 高校讲座：上海高校公开学术讲座与报告
- AI 聚会：AI/技术沙龙、黑客松、行业大会

## 数据字段（每条活动）
- title：活动名称
- start_time / end_time：ISO 8601 时间戳（上海时区 +08:00）
- venue：场馆/地点
- category：上面五个分类之一
- signup_url：报名/购票外链
- source_name / source_url：来源站点
- summary：活动简介（如有）
- image_url：封面图（如有）

## API 用法
GET ${base}/api/events?week=YYYY-MM-DD&category=演出音乐&search=爵士
- week：窗口起始日（上海日期），默认今天
- category：可选，见上面的分类
- search：可选，匹配标题/场馆/简介（最多 100 字符）

## 数据更新
- 采集频率：每两日一次（GitHub Actions）
- 时间窗口：滚动未来 14 天；展览可追溯 60 天内开幕、高校讲座可追溯 30 天内
- 同一活动多源重复时自动去重合并
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200",
    },
  });
}
