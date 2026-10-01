export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://news.leoncoooolest.com").replace(/\/+$/, "");
}
