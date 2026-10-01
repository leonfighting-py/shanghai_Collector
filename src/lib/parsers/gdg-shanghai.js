import { buildEvent } from "./shared.js";

// GDG 上海社区（Bevy 平台）：https://gdg.community.dev/gdg-shanghai/
// SSR HTML 内嵌 React 序列化 JSON，每个活动对象形如（键按字母序）：
//   {"allows_cohosting":...,"cropped_banner_url":"...","description":"...",
//    "event_type_title":"Paid registration","is_conference":false,
//    "start_date":"2026-10-17T01:30:00Z","title":"GDG Shanghai x TRIPOTHON S1 Demo Day",
//    "url":"https://gdg.community.dev/events/details/..."}
// 上游同一份 payload 会输出两遍（SSR/hydration），按 url 去重；
// 页面同时展示 Upcoming 与 Past 区块，往期活动交给采集时间窗过滤。

function decodeJsonEscapes(text = "") {
  return String(text)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .trim();
}

function lastMatch(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

export function parseGdgShanghai(html, source) {
  const events = [];
  const seen = new Set();

  for (const match of html.matchAll(/"url":"(https:\/\/gdg\.community\.dev\/events\/details\/[^"]+)"/g)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);

    // 同一对象各字段紧邻 url 之前（对象总长约 2KB），取窗口内最后一个匹配即本活动字段
    const context = html.slice(Math.max(0, match.index - 2600), match.index);
    const startRaw = lastMatch(context, /"start_date":"([^"]+)"/g);
    const titleRaw = lastMatch(context, /"title":"((?:[^"\\]|\\.)+)"/g);
    const banner = lastMatch(context, /"cropped_banner_url":"(https?:[^"]*)"/g);

    const title = decodeJsonEscapes(titleRaw || "");
    if (!title || !startRaw) continue;

    const event = buildEvent({
      title,
      start_time: startRaw,
      venue: "上海",
      signup_url: url,
      image_url: banner,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}