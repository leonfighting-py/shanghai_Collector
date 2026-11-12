import { getSiteUrl } from "../lib/site-url.js";

export default function robots() {
  const base = getSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
