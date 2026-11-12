import { defaultFetchHtml } from "../fetch-html.js";
import { absoluteUrl, buildEvent, mapWithLimit, stripTags } from "./shared.js";

// 本文件聚合多个上海高校「学术讲座」SSR 列表的专用 parser：
//   parseFudanChemistry   复旦大学化学系
//   parseSjtuNewsLectures 上海交通大学新闻中心·学术讲座
//   parseShiepLectures    上海电力大学·学术活动
//   parseShanghaitechLectures 上海科技大学·讲座报告
//   parseEcustLectures    华东理工大学·讲座报告（多学科聚合）
//   parseFudanShmcLectures 复旦大学上海医学院·讲座信息
//   parseFudanSpfduLectures 复旦大学药学院·名师讲坛/论坛
// 这些站点各有独立模板，通用 parseListingSite 无法覆盖，故逐个定制。

// ===================== 日期时间辅助 =====================
// 形如 "2026-07-14 10:00" 或 "2026-06-04 11:50—13:20"（取开始时刻）
function parseIsoSpaceTime(raw) {
  const m = String(raw || "")
    .replace(/&nbsp;/g, " ")
    .trim()
    .match(/(20\d{2})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5].padStart(2, "0")}:00+08:00`;
}

// 形如 "2026年8月31日 14:00" 或 "2026年8月31日"
function parseCnDateTime(raw, fallbackHour = 14) {
  const m = String(raw || "").match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const h = m[4] ? m[4].padStart(2, "0") : String(fallbackHour).padStart(2, "0");
  const mi = m[5] ? m[5].padStart(2, "0") : "00";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${h}:${mi}:00+08:00`;
}

// ===================== 复旦大学化学系 =====================
// 列表页：https://chemistry.fudan.edu.cn/46012/list.htm
// <div class="jiang-li"><a href="/08/07/c46012a788487/page.htm">
//   <h5>标题</h5><div class="jiang-pp">
//     <p><i class="fa fa-user-circle-o"></i>主讲：Dr. Dörthe Mellmann</p>
//     <p><i class="fa fa-clock-o"></i>时间：2026年8月31日 14:00</p>
//     <p><i class="fa fa-arrow-circle-right"></i>地点：江湾校区化学楼A7032</p>
//   </div></a></div>
const FUDAN_CHEM_ITEM_RE =
  /<div class="jiang-li">\s*<a href="([^"]+)"[^>]*>[\s\S]*?<h5>([\s\S]*?)<\/h5>\s*<div class="jiang-pp">([\s\S]*?)<\/div>\s*<\/a>/g;

export async function parseFudanChemistry(html, source) {
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(FUDAN_CHEM_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[2]).trim();
    const meta = stripTags(m[3]);
    const timeRaw = meta.match(/时间[：:]\s*(.+?)\s*地点/)?.[1] || "";
    const venueRaw = (meta.match(/地点[：:]\s*([\s\S]+)$/)?.[1] || "").trim();
    if (!title) continue;
    const startTime = parseCnDateTime(timeRaw);
    const venue = venueRaw ? `复旦大学·${venueRaw}` : "复旦大学江湾校区";
    items.push(buildEvent({ title, start_time: startTime, venue, signup_url: href, source }));
  }
  return items.filter(Boolean);
}

// ===================== 上海交通大学新闻中心·学术讲座 =====================
// 列表页：https://news.sjtu.edu.cn/xsjz/index.html
// 真实 HTML 内 <div class="address"> 与 <i> 之间有换行+大量缩进空白，地址文本也跨多行：
//   <a href="/224487.html" target="_blank" class="item">
//     <div class="time"><span>2026-07-14&nbsp;10:00</span></div>
//     <p class="dot title">通过固态核磁共振技术探索金属有机框架（MOFs）的研究图景</p>
//     <div class="tag dot">教学工作坊 (数字化赋能教师发展系列)</div>  ← 可选
//     <div class="address">\n  <i class="iconfont icon-dingwei"></i>\n  闵行校区转化医学大楼\n  C100\n</div>
//     <div class="person">\n  <i class="iconfont icon-yonghu"></i>\n  黄忆宁\n</div>
//   </a>
const SJTU_NEWS_ITEM_RE =
  /<a href="([^"]+)"[^>]*class="item">[\s\S]*?<div class="time">\s*<span>([^<]+)<\/span>\s*<\/div>\s*<p class="dot title">([\s\S]*?)<\/p>(?:\s*<div class="tag dot">([\s\S]*?)<\/div>)?[\s\S]*?<div class="address">\s*<i[^>]*><\/i>\s*([\s\S]*?)<\/div>\s*<div class="person">\s*<i[^>]*><\/i>\s*([\s\S]*?)<\/div>/g;

export async function parseSjtuNewsLectures(html, source) {
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(SJTU_NEWS_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[3]).trim();
    const tag = m[4] ? stripTags(m[4]).trim() : "";
    const venue = stripTags(m[5]).trim();
    if (!title) continue;
    const startTime = parseIsoSpaceTime(m[2]);
    const fullTitle = tag ? `${title}（${tag}）` : title;
    const fullVenue = venue ? `上海交通大学·${venue}` : "上海交通大学";
    items.push(buildEvent({ title: fullTitle, start_time: startTime, venue: fullVenue, signup_url: href, source }));
  }
  return items.filter(Boolean);
}

// ===================== 上海电力大学·学术活动 =====================
// 列表页：https://www.shiep.edu.cn/academics/list.htm
// <li class="list-item i1">
//   <div class="article-title"><a class="article-link" href="..." title="...">标题</a></div>
//   <div class="article-metas clearfix">
//     <div class="metas-l1">时间：2026-07-03 14:00:00</div>
//     <div class="metas-l2">地点：杨浦校区行政中心9楼1号会议室</div>
//   </div>
//   <div class="article-metas clearfix">
//     <div class="metas-l1">主讲：王昊奋</div>
//     <div class="metas-l2">主办：中国计算机学会</div>
//   </div>
// </li>
const SHIEP_ITEM_RE =
  /<li class="list-item[^"]*">[\s\S]*?<a class="article-link" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="metas-l1">时间[：:]\s*([^<]+)<\/div>\s*<div class="metas-l2">地点[：:]\s*([^<]+)<\/div>/g;

export async function parseShiepLectures(html, source) {
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(SHIEP_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[2]).trim();
    const venueRaw = stripTags(m[4]).trim();
    if (!title) continue;
    const startTime = parseIsoSpaceTime(m[3]);
    const venue = venueRaw ? `上海电力大学·${venueRaw}` : "上海电力大学";
    items.push(buildEvent({ title, start_time: startTime, venue, signup_url: href, source }));
  }
  return items.filter(Boolean);
}

// ===================== 上海科技大学·讲座报告 =====================
// 列表页：https://www.shanghaitech.edu.cn/p15080c14750/list.htm
// <a class="news_box clearfix" href="/2026/0828/c14750a1126658/page.htm">
//   <div class="news_imgs"><img src="..." alt="标题"/></div>
//   <div class="news_con"><div class="news_wz">
//     <div class="news_title">标题</div>
//     <div class="news_text">主讲人简介：...</div>
//   </div></div>
// </a>
// 详情页结构：
//   <div class="title th">开始时间（Start Time）：</div><div class="nr">2026-09-16 12:00</div>
//   <div class="title tf">报告地点（Place）：</div><div class="nr">SEM501</div>
const SHANGHAITECH_LIST_RE =
  /<a class="news_box[^"]*" href="([^"]+)"[^>]*>[\s\S]*?<div class="news_title">([\s\S]*?)<\/div>/g;
const SHT_DETAIL_TIME_RE = /开始时间[（(]Start Time[)）][：:]\s*<\/div>\s*<div class="nr">([^<]+)<\/div>/;
const SHT_DETAIL_PLACE_RE = /报告地点[（(]Place[)）][：:]\s*<\/div>\s*<div class="nr">([^<]+)<\/div>/;

export async function parseShanghaitechLectures(html, source, { fetchHtml = defaultFetchHtml } = {}) {
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(SHANGHAITECH_LIST_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[2]).trim();
    if (!title) continue;
    items.push({ href, title });
  }

  return mapWithLimit(items.slice(0, 12), 4, async (item) => {
    let startTime = null;
    let venue = "上海科技大学";
    try {
      const detail = await fetchHtml(item.href);
      const timeRaw = detail.match(SHT_DETAIL_TIME_RE);
      if (timeRaw) startTime = parseIsoSpaceTime(stripTags(timeRaw[1]));
      const placeRaw = detail.match(SHT_DETAIL_PLACE_RE);
      if (placeRaw) {
        const p = stripTags(placeRaw[1]).trim();
        if (p) venue = `上海科技大学·${p}`;
      }
    } catch {
      // 详情页失败时以讲座归属兜底
    }
    return buildEvent({ title: item.title, start_time: startTime, venue, signup_url: item.href, source });
  });
}

// ===================== 华东理工大学·讲座报告（多学科聚合） =====================
// 列表页：https://news.ecust.edu.cn/jzbg/list.htm （单页 24 条）
// <ul class="news_list list2">
//   <li class="news n1 clearfix">
//     <div class="news_title"><a href='/2026/0706/c171a201763/page.htm' title='合成生物学...'>合成生物学...</a></div>
//     <div class="jz jz_time">讲座时间：<span class="oldshow"></span><span class="newshow">2026-07-09 14:00:00</span></div>
//     <div class="jz jz_addredd">讲座地点：<span class="oldfield"></span><span class="newfield">6教206会议室</span></div>
//   </li>
// 覆盖化学/生物/药学/经济学等多个学科，是高校讲座分类的主力源之一。
const ECUST_ITEM_RE =
  /<li class="news n\d+ clearfix">\s*<div class="news_title"><a href='([^']+)'[^>]*>([\s\S]*?)<\/a><\/div>\s*<div class="jz jz_time">[\s\S]*?<span class="newshow">([^<]+)<\/span><\/div>\s*<div class="jz jz_addredd">[\s\S]*?<span class="newfield">([^<]+)<\/span><\/div>/g;

export async function parseEcustLectures(html, source) {
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(ECUST_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[2]).trim();
    const venueRaw = stripTags(m[4]).trim();
    if (!title) continue;
    const startTime = parseIsoSpaceTime(m[3]);
    const venue = venueRaw ? `华东理工大学·${venueRaw}` : "华东理工大学";
    items.push(buildEvent({ title, start_time: startTime, venue, signup_url: href, source }));
  }
  return items.filter(Boolean);
}

// ===================== 复旦大学上海医学院·讲座信息 =====================
// 列表页：https://gs-shmc.fudan.edu.cn/sywtz/list1.htm （「最新动态」栏目标识［讲座信息］）
// 结构：嵌套 <table>+<tbody>+<tr> 中
//   <a href='/0d/ab/c35561a789931/page.htm' title='［讲座信息］Neuromodulator control...'>...</a>
//   <td align="right" class="ti">2026-09-07</td>
// 详情页是讲座海报图（无结构化时间/地点），故用发布日期作为开始时间兜底（医学院讲座通常为发布日当/次日举行）。
const FUDAN_SHMC_ITEM_RE =
  /<a href='([^']+)'[^>]*title='(［讲座信息］[^']*)'[^>]*>[\s\S]*?<td align="right" class="ti">([^<]+)<\/td>/g;

export async function parseFudanShmcLectures(html, source) {
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(FUDAN_SHMC_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[2]).trim();
    if (!title) continue;
    const publishDate = String(m[3]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) continue;
    const startTime = `${publishDate}T14:00:00+08:00`;
    items.push(buildEvent({ title, start_time: startTime, venue: "复旦大学上海医学院", signup_url: href, source }));
  }
  return items.filter(Boolean);
}

// ===================== 复旦大学药学院·名师讲坛/论坛 =====================
// 列表页：https://spfdu.fudan.edu.cn/28477/list.htm （「通知公告」栏目）
// <div class="jzlb clearfix">
//   <div class="btt3"><a href="/03/f7/c28477a787447/page.htm" target="_blank">8月3日松德名师讲坛-未来十年...</a></div>
//   <div class="fbsj4">2026-07-31</div>
// </div>
// 列表混杂讲座与行政通知（推免名单/招生公告等），故按标题关键词过滤；
// 标题常含 "8月3日" / "7月16日" 形式日期，优先解析作为讲座日，否则退回发布日期兜底。
const FUDAN_SPFDU_ITEM_RE =
  /<div class="jzlb clearfix">\s*<div class="btt3"><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/div>\s*<div class="fbsj4">([^<]+)<\/div>/g;
const SPFDU_TITLE_KEYWORDS = /讲座|讲坛|论坛|报告|Seminar|前沿|高端论坛|青年论坛|名师讲坛/;
const SPFDU_TITLE_DATE_RE = /(\d{1,2})月(\d{1,2})日/;

export async function parseFudanSpfduLectures(html, source) {
  const items = [];
  const seen = new Set();
  const currentYear = new Date().getFullYear();
  for (const m of html.matchAll(FUDAN_SPFDU_ITEM_RE)) {
    const href = absoluteUrl(source.url, m[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = stripTags(m[2]).trim();
    if (!title || !SPFDU_TITLE_KEYWORDS.test(title)) continue;
    let startTime = null;
    const titleDate = title.match(SPFDU_TITLE_DATE_RE);
    if (titleDate) {
      const month = String(titleDate[1]).padStart(2, "0");
      const day = String(titleDate[2]).padStart(2, "0");
      startTime = `${currentYear}-${month}-${day}T14:00:00+08:00`;
    }
    if (!startTime) {
      const publishDate = String(m[3]).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) continue;
      startTime = `${publishDate}T14:00:00+08:00`;
    }
    items.push(buildEvent({ title, start_time: startTime, venue: "复旦大学药学院", signup_url: href, source }));
  }
  return items.filter(Boolean);
}
