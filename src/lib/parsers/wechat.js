import { fetchArticlesFromWechatExporter, getWechatExporterConfig, expandArticlesWithParsedEvents } from "../wechat-exporter.js";
import { buildEvent } from "./shared.js";

/**
 * Fetch events from a user-provided WeChat official-account middleware API.
 *
 * Expected JSON shapes (any one):
 * 1) { "events": [ { title, start_time, venue, category, signup_url, ... } ] }
 * 2) { "articles": [ { title, publish_time, link, account_name, ... } ] }
 * 3) [ { title, start_time, ... } ]
 *
 * Or configure private wechat-article-exporter:
 * WECHAT_EXPORTER_BASE_URL + WECHAT_EXPORTER_AUTH_KEY + WECHAT_EXPORTER_ACCOUNTS
 */
export async function parseWechatOfficialAccounts(_html, source, { fetchPayload } = {}) {
  const exporterConfig = getWechatExporterConfig();
  if (exporterConfig.enabled) {
    const articles = await fetchArticlesFromWechatExporter(exporterConfig);
    const rows = await expandArticlesWithParsedEvents(articles, exporterConfig);
    return mapArticleRows(rows, source);
  }

  const apiUrl = process.env.WECHAT_EVENTS_API_URL;
  if (!apiUrl) return [];

  const payload = fetchPayload ? await fetchPayload(apiUrl) : await fetchWechatPayload(apiUrl);
  const rows = normalizeWechatPayload(payload);
  return mapArticleRows(rows, source);
}

function mapArticleRows(rows, source) {
  const defaultCategory = process.env.WECHAT_DEFAULT_CATEGORY || source.category;

  return rows
    .map((row) =>
      buildEvent({
        title: row.title,
        start_time: row.start_time || row.publish_time || row.date,
        end_time: row.end_time || null,
        venue: row.venue || row.location || "上海",
        signup_url: row.signup_url || row.link || row.url,
        source: {
          ...source,
          name: row.account_name ? `公众号·${row.account_name}` : source.name,
          url: row.link || row.url || source.url,
        },
        category: row.category || defaultCategory,
      }),
    )
    .filter(Boolean);
}

function normalizeWechatPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.articles)) return payload.articles.map(articleFromWechatArticle);
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function articleFromWechatArticle(article) {
  return {
    title: article.title,
    publish_time: article.publish_time || article.update_time || article.create_time,
    link: article.link || article.url,
    account_name: article.account_name || article.nickname || article.author,
    venue: article.venue || "上海",
    category: article.category,
  };
}

async function fetchWechatPayload(apiUrl) {
  const headers = { accept: "application/json" };
  if (process.env.WECHAT_EVENTS_API_KEY) {
    headers.authorization = `Bearer ${process.env.WECHAT_EVENTS_API_KEY}`;
  }

  const response = await fetch(apiUrl, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`WeChat API HTTP ${response.status}`);
  return response.json();
}
