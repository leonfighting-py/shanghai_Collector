// X / Twitter 免鉴权通路探测（只读）
// 目标：找到不需要 API key、能拿到某个账号近期推文的方式，用于把上海场馆/主办方的 X 账号接成信源。
const CANDIDATES = [
  ["syndication cdn timeline", "https://cdn.syndication.twimg.com/timeline/profile?screen_name=teamlab_art&lang=en&with_replies=false&show_replies=false"],
  ["syndication srv timeline", "https://syndication.twitter.com/srv/timeline-profile/screen-name/teamlab_art"],
  ["syndication widget", "https://syndication.twitter.com/widgets/timelines/profile?screen_name=teamlab_art"],
  ["rsshub public", "https://rsshub.app/twitter/user/teamlab_art"],
  ["nitter net", "https://nitter.net/teamlab_art/rss"],
  ["nitter poast", "https://nitter.poast.org/teamlab_art/rss"],
  ["nitter priv", "https://nitter.privacydev.net/teamlab_art/rss"],
  ["xcancel", "https://xcancel.com/teamlab_art/rss"],
  ["twitter rss bridge", "https://twiiit.com/teamlab_art"],
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

for (const [label, url] of CANDIDATES) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "*/*", "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.text();
    const looksLikeTweets =
      /"full_text"|"tweet"|<item>|<title>|<rss|created_at|itemListElement/i.test(body);
    console.log(
      `${String(response.status).padEnd(4)} ${String(body.length).padStart(8)}B  ${looksLikeTweets ? "含推文特征" : "无推文特征"}  ${label}\n      ${url}`,
    );
    if (looksLikeTweets) console.log("      片段: " + body.slice(0, 260).replace(/\s+/g, " "));
  } catch (error) {
    console.log(`ERR  ${label.padEnd(24)} ${error.message.slice(0, 60)}`);
  }
}
