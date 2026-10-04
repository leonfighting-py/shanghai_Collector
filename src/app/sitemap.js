import { CATEGORIES } from "../lib/events.js";
import { getSiteUrl } from "../lib/site-url.js";

export default function sitemap() {
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

  return entries;
}
