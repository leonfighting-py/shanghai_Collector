import { defaultFetchJson } from "../fetch-html.js";
import { buildEvent, parseFlexibleDate, stripTags } from "./shared.js";

// X（Twitter）时间线解析器 —— 默认不启用。
//
// 启用前提（两个都要满足）：
//   1. X_BEARER_TOKEN：X API v2 的 App-only Bearer Token（免费额度极低，通常需付费档）
//   2. 运行环境能出网到 api.x.com：本机与本项目 GitHub Actions 的 self-hosted runner
//      都在境内，TCP 直连被拒（DNS 可解析、握手不通），必须换成境外出口
//      （例如 GitHub 官方 ubuntu-latest runner 单独跑一个 job）。
//
// 满足后设置 X_SHANGHAI_ACCOUNTS=teamlab_art,xxx 即可激活；未设置时不会注册任何源。
//
// 抽取策略：推文正文里必须显式的日期（中文/ISO 均可），否则丢弃——
// 推文发布时间 ≠ 活动时间，拿不到活动日期就无法排进 14 天窗口。

const USER_LOOKUP = "https://api.x.com/2/users/by/username";
const TIMELINE = "https://api.x.com/2/users";
const TWEET_FIELDS = "tweet.fields=created_at,entities&exclude=retweets,replies";
const MAX_TWEETS = 30;

function authHeaders() {
  return { authorization: `Bearer ${process.env.X_BEARER_TOKEN}`, "user-agent": "news-collector/1.0" };
}

function extractTitle(text = "") {
  const clean = stripTags(text)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[^\s#]+/g, " ")
    .replace(/@[\w]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = clean.split(/[。！？!?\n]/)[0] || clean;
  return firstSentence.trim();
}

function extractDate(text = "") {
  const flat = stripTags(text).replace(/\s+/g, " ");
  return parseFlexibleDate(flat);
}

function extractLink(tweet, fallbackUrl) {
  const urls = tweet?.entities?.urls || [];
  const expanded = urls.find((item) => !item.expanded_url?.includes("twitter.com"))?.expanded_url || urls[0]?.expanded_url;
  return expanded || fallbackUrl;
}

async function fetchTimeline(username, { fetchJson = defaultFetchJson } = {}) {
  const user = await fetchJson(`${USER_LOOKUP}/${encodeURIComponent(username)}`, { headers: authHeaders() });
  const id = user?.data?.id;
  if (!id) return [];
  const timeline = await fetchJson(`${TIMELINE}/${id}/tweets?max_results=${MAX_TWEETS}&${TWEET_FIELDS}`, {
    headers: authHeaders(),
  });
  return timeline?.data || [];
}

export async function parseXTimeline(_html, source, { fetchJson = defaultFetchJson } = {}) {
  const username = source.xHandle;
  if (!username || !process.env.X_BEARER_TOKEN) return [];

  let tweets;
  try {
    tweets = await fetchTimeline(username, { fetchJson });
  } catch {
    return [];
  }

  const events = [];
  for (const tweet of tweets) {
    const start = extractDate(tweet.text || "");
    if (!start) continue;
    const title = extractTitle(tweet.text || "");
    const event = buildEvent({
      title,
      start_time: start,
      venue: source.defaultVenue || "上海",
      signup_url: extractLink(tweet, `https://x.com/${username}/status/${tweet.id}`),
      source,
    });
    if (event) events.push(event);
  }
  return events;
}
