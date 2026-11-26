import { CATEGORIES } from "../lib/events.js";
import { listIssues } from "../lib/issues.js";
import { listEvents } from "../lib/repository.js";
import { SCENES } from "../lib/scenes.js";
import { getSiteUrl } from "../lib/site-url.js";

export default async function sitemap() {
  const base = getSiteUrl();
  const now = new Date();

  const entries = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/feed.xml`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/llms.txt`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/api/events`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
  ];

  for (const category of CATEGORIES) {
    entries.push({
      url: `${base}/?category=${encodeURIComponent(category)}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  // 期刊归档：往期列表 + 每一期。快照不随活动清理改变，值得收录
  entries.push({ url: `${base}/issues`, lastModified: now, changeFrequency: "daily", priority: 0.7 });
  let issues = [];
  try {
    issues = await listIssues({ limit: 60 });
  } catch {
    issues = [];
  }
  for (const issue of issues) {
    entries.push({
      url: `${base}/issue/${issue.date}`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    });
  }

  // 场景页：?scene=tonight 这类入口可以分享、可以收录
  for (const scene of SCENES) {
    entries.push({
      url: `${base}/?scene=${scene.key}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  // 每场活动一个可分享、可收录的地址。查库失败时退回只出固定页 ——
  // 搜索引擎拿不到整个 sitemap，比少几条详情页更糟。
  let events = [];
  try {
    events = await listEvents({});
  } catch {
    events = [];
  }

  for (const event of events) {
    entries.push({
      url: `${base}/e/${event.slug}`,
      lastModified: event.updated_at ? new Date(event.updated_at) : now,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return entries;
}
