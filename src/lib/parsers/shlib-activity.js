import { buildEvent, stripTags } from "./shared.js";

// 上海图书馆「活动预约」：https://www.library.sh.cn/activity（Nuxt SSR）
// 条目结构（含讲座/展览/培训 tab，tabName 参数切换）：
//   <div class="activity-list-item">
//     <div class="activity-list-item-img" style="background-image:url(https://reg.library.sh.cn/…jpg);">
//       <div class="activity-list-item-label">东馆</div></div>
//     <div class="activity-list-item-content">
//       <div class="activity-list-item-title">【讲座】电影放映 | 《飞驰人生3》
//         <div class="activity-list-item-tag">即将开始</div></div>
//       <div class="activity-list-item-address">上海图书馆东馆1F阅剧场</div>
//       <div class="activity-list-item-date">2026年10月01日14:00  -  16:00</div>
//       <div class="activity-list-item-status">预约</div></div>
//   </div>
// 条目无独立详情链接，报名入口即活动页本身。

function parseCnDateTime(raw) {
  const text = String(raw || "").replace(/\s+/g, "");
  const m = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日(?:(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const hour = m[4] ? m[4].padStart(2, "0") : "10";
  const minute = m[5] || "00";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${hour}:${minute}:00+08:00`;
}

export function parseShlibActivity(html, source) {
  const events = [];

  for (const block of html.split(/<div class="activity-list-item"/).slice(1)) {
    // 标题 div 内嵌「状态标签」子 div，取第一个子 div 之前的文本
    const titleRaw = block.match(/activity-list-item-title"[^>]*>([\s\S]*?)(?:<div|<\/div>)/)?.[1] || "";
    const title = stripTags(titleRaw).trim();
    const dateText = block.match(/activity-list-item-date"[^>]*>\s*([^<]+)/)?.[1] || "";
    const address = stripTags(block.match(/activity-list-item-address"[^>]*>\s*([^<]+)/)?.[1] || "").trim();
    const image = block.match(/background-image:\s*url\((['"]?)(https?:[^)'"]+)\1\)/)?.[2] || null;

    const startTime = parseCnDateTime(dateText);
    if (!title || !startTime) continue;

    const venue = address ? (address.includes("图书馆") ? address : `上海图书馆·${address}`) : "上海图书馆";
    const event = buildEvent({
      title,
      start_time: startTime,
      venue,
      signup_url: source.url,
      image_url: image,
      source,
    });
    if (event) events.push(event);
  }

  return events;
}