import { extractEventsFromArticleText } from "./wechat-date-parser.js";
import { mapWithLimit } from "./parsers/shared.js";

const DEFAULT_BASE_URL = "http://localhost:3001";

function titleMatchesFilters(title, { includePattern, excludePattern }) {
  if (excludePattern && excludePattern.test(title)) return false;
  if (includePattern && !includePattern.test(title)) return false;
  return true;
}

function parsePattern(value) {
  if (!value?.trim()) return null;
  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return new RegExp(parts.join("|"), "i");
}

export function getWechatExporterConfig() {
  const baseUrl = (process.env.WECHAT_EXPORTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const authKey = process.env.WECHAT_EXPORTER_AUTH_KEY?.trim();
  const accounts = (process.env.WECHAT_EXPORTER_ACCOUNTS || "")
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const articleKeyword = process.env.WECHAT_EXPORTER_ARTICLE_KEYWORD?.trim() || "";
  const includePattern = parsePattern(process.env.WECHAT_EXPORTER_TITLE_INCLUDE);
  const excludePattern = parsePattern(process.env.WECHAT_EXPORTER_TITLE_EXCLUDE);

  return {
    enabled: Boolean(baseUrl && authKey && accounts.length > 0),
    baseUrl,
    authKey,
    accounts,
    articleKeyword,
    includePattern,
    excludePattern,
    pageSize: Number(process.env.WECHAT_EXPORTER_PAGE_SIZE || 20),
    maxPages: Number(process.env.WECHAT_EXPORTER_MAX_PAGES || 3),
    parseContent: process.env.WECHAT_EXPORTER_PARSE_CONTENT !== "false",
    maxContentArticles: Number(process.env.WECHAT_EXPORTER_MAX_CONTENT_ARTICLES || 50),
    contentConcurrency: Number(process.env.WECHAT_EXPORTER_CONTENT_CONCURRENCY || 4),
  };
}

export async function fetchArticlesFromWechatExporter(config = getWechatExporterConfig(), { fetchJson } = {}) {
  if (!config.enabled) return [];

  const requestJson = fetchJson || defaultFetchJson.bind(null, config);
  const articles = [];

  for (const accountName of config.accounts) {
    const account = await searchAccount(accountName, config, requestJson);
    if (!account) continue;

    const accountArticles = await listAccountArticles(account, config, requestJson);
    for (const article of accountArticles) {
      if (!titleMatchesFilters(article.title, config)) continue;
      articles.push({
        title: article.title,
        publish_time: toIsoShanghai(article.update_time || article.create_time),
        link: article.link,
        account_name: account.nickname || accountName,
        venue: "上海",
      });
    }
  }

  return articles;
}

export async function fetchArticleText(link, config = getWechatExporterConfig(), { fetchText } = {}) {
  if (!link) return "";
  const requestText = fetchText || defaultFetchText.bind(null, config);
  return requestText(link);
}

export async function expandArticlesWithParsedEvents(articles, config = getWechatExporterConfig(), options = {}) {
  if (!config.parseContent) return articles;

  const limit = Math.min(articles.length, config.maxContentArticles);
  const targets = articles.slice(0, limit);
  const defaultCategory = process.env.WECHAT_DEFAULT_CATEGORY || "线下活动";

  const expanded = await mapWithLimit(targets, config.contentConcurrency, async (article) => {
    try {
      const text = await fetchArticleText(article.link, config, options);
      const parsed = extractEventsFromArticleText(text, {
        title: article.title,
        publishTime: article.publish_time,
        link: article.link,
        accountName: article.account_name,
        defaultCategory,
      });

      if (parsed.length === 0) {
        return [article];
      }

      return parsed.map((event) => ({
        title: event.title,
        start_time: event.start_time,
        end_time: event.end_time,
        venue: event.venue,
        category: event.category,
        link: event.link,
        account_name: event.account_name,
        publish_time: article.publish_time,
      }));
    } catch {
      return [article];
    }
  });

  return [...expanded.flat(), ...articles.slice(limit)];
}

async function defaultFetchText(config, link) {
  const query = new URLSearchParams({
    url: link,
    format: "text",
  });
  const response = await fetch(`${config.baseUrl}/api/public/v1/download?${query.toString()}`, {
    headers: {
      accept: "text/plain, application/json, */*",
      "X-Auth-Key": config.authKey,
    },
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`WeChat exporter download HTTP ${response.status}`);
  }

  return response.text();
}

async function searchAccount(keyword, config, fetchJson) {
  const payload = await fetchJson(
    `/api/public/v1/account?keyword=${encodeURIComponent(keyword)}&size=5`,
  );

  if (payload?.base_resp?.ret !== 0) {
    throw new Error(payload?.base_resp?.err_msg || `搜索公众号失败：${keyword}`);
  }

  const list = payload?.list || [];
  const exact = list.find((item) => item.nickname === keyword);
  return exact || list[0] || null;
}

async function listAccountArticles(account, config, fetchJson) {
  const collected = [];

  for (let page = 0; page < config.maxPages; page += 1) {
    const begin = page * config.pageSize;
    const query = new URLSearchParams({
      fakeid: account.fakeid,
      begin: String(begin),
      size: String(config.pageSize),
    });
    if (config.articleKeyword) query.set("keyword", config.articleKeyword);

    const payload = await fetchJson(`/api/public/v1/article?${query.toString()}`);
    if (payload?.base_resp?.ret !== 0) {
      throw new Error(payload?.base_resp?.err_msg || `获取文章失败：${account.nickname}`);
    }

    const batch = payload?.articles || [];
    collected.push(...batch);
    if (batch.length < config.pageSize) break;
  }

  return collected;
}

async function defaultFetchJson(config, path) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: {
      accept: "application/json",
      "X-Auth-Key": config.authKey,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`WeChat exporter HTTP ${response.status} for ${path}`);
  }

  return response.json();
}

function toIsoShanghai(unixSeconds) {
  if (!unixSeconds) return null;
  const date = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function validateWechatExporterAuth(config = getWechatExporterConfig(), { fetchJson } = {}) {
  if (!config.authKey) return { ok: false, message: "缺少 WECHAT_EXPORTER_AUTH_KEY" };

  const requestJson = fetchJson || defaultFetchJson.bind(null, config);
  const payload = await requestJson("/api/public/v1/authkey");
  if (payload?.code === 0) return { ok: true, message: "auth key 有效" };
  return { ok: false, message: payload?.msg || "auth key 已过期，请在本地 exporter 重新扫码登录" };
}
