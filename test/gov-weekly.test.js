import test from "node:test";
import assert from "node:assert/strict";

import {
  extractWeeklyBlocks,
  parseGovWeeklyEvents,
  parsePreviewWhen,
  siblingListPageUrl,
} from "../src/lib/parsers/gov-weekly.js";

const source = {
  name: "上海市政府·区文化活动预告",
  url: "https://www.shanghai.gov.cn/nw17239/index.html",
  category: "线下活动",
  tier: "T2",
  defaultVenue: "上海",
};

// T1：字段式（普陀区政府排版）
const T1_HTML = `
<div>
  <p>图书馆</p>
  <p>活动名称：美育大课堂声控机器人科普手作体验</p>
  <p>时间：10月16日15:30</p>
  <p>地点：普陀区图书馆3楼学术报告厅1（铜川路1278号）</p>
  <p>活动内容：走进声控机器人的奇妙世界。</p>
  <p>参与方式：微信公众号报名</p>
  <p>活动名称：&ldquo;阅享苏河&rdquo;读书会：冷水珊瑚不太冷</p>
  <p>时间：2026年10月18日14:00</p>
  <p>地点：上海少年儿童图书馆（长风馆）B座一楼报告厅</p>
</div>`;

// T2：段首标题式（虹口区文化馆排版）
const T2_HTML = `
<div>
  <p>江湾镇街道分馆</p>
  <p>传统沪剧《槐花泪》观演活动</p>
  <p>活动时间：2026年10月28日下午13:30</p>
  <p>活动地点：虹口区文化馆江湾镇街道分馆小剧场（丰镇路21号）</p>
  <p>参与方式：直接参与</p>
  <p>活动简介：农家女宋文英……</p>
</div>`;

test("周报展开：字段式正文按「活动名称/时间/地点」拆成多场", () => {
  const blocks = extractWeeklyBlocks(T1_HTML, { publishDate: new Date("2026-10-12T12:00:00+08:00") });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].title, "美育大课堂声控机器人科普手作体验");
  assert.equal(blocks[0].start_time, "2026-10-16T15:30:00+08:00");
  assert.equal(blocks[0].venue, "普陀区图书馆3楼学术报告厅1（铜川路1278号）");
  assert.equal(blocks[1].start_time, "2026-10-18T14:00:00+08:00");
});

test("周报展开：段首标题式正文取「活动时间」上一行当标题", () => {
  const blocks = extractWeeklyBlocks(T2_HTML, { publishDate: new Date("2026-09-30T12:00:00+08:00") });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].title, "传统沪剧《槐花泪》观演活动");
  assert.equal(blocks[0].start_time, "2026-10-28T13:30:00+08:00");
  assert.match(blocks[0].venue, /虹口区文化馆江湾镇街道分馆/);
});

test("日期：缺年份用发布年兜底，跨年（月份早于发布月 7 个月以上）顺延一年", () => {
  // 12 月发布、活动写 1 月 → 次年
  assert.equal(parsePreviewWhen("1月8日 14:00", new Date("2026-12-20T12:00:00+08:00")), "2027-01-08T14:00:00+08:00");
  // 6 月发布、活动写 10 月 → 同年
  assert.equal(parsePreviewWhen("10月8日 14:00", new Date("2026-06-20T12:00:00+08:00")), "2026-10-08T14:00:00+08:00");
  // 显式年份优先
  assert.equal(parsePreviewWhen("2027年3月1日 10:00", new Date("2026-12-20T12:00:00+08:00")), "2027-03-01T10:00:00+08:00");
});

test("日期：下午/晚上补 12 小时，全角冒号与破折号归一", () => {
  assert.equal(parsePreviewWhen("10月16日 下午2：30", new Date("2026-10-10T12:00:00+08:00")), "2026-10-16T14:30:00+08:00");
  assert.equal(parsePreviewWhen("2026年10月15日，10：00—11：30", new Date("2026-10-10T12:00:00+08:00")), "2026-10-15T10:00:00+08:00");
  // 没写时刻时按 10:00 兜底（与项目其他 parser 一致）
  assert.equal(parsePreviewWhen("10月1日", new Date("2026-09-20T12:00:00+08:00")), "2026-10-01T10:00:00+08:00");
});

test("日期：只有月份没有日 → 不产出（宁缺勿错）", () => {
  assert.equal(parsePreviewWhen("2026年10月（每周六）14:00", new Date("2026-10-01T12:00:00+08:00")), null);
});

test("分页：index.html → index_N.html，目录 URL 同规则", () => {
  assert.equal(siblingListPageUrl("https://www.shanghai.gov.cn/nw17239/index.html", 8), "https://www.shanghai.gov.cn/nw17239/index_8.html");
  assert.equal(siblingListPageUrl("https://www.shanghai.gov.cn/nw17239/", 3), "https://www.shanghai.gov.cn/nw17239/index_3.html");
  assert.equal(siblingListPageUrl("https://example.com/a/b.html", 3), null);
});

test("列表页：强特征文章先展开，弱特征单场稿被 ≥2 场规则丢弃，招聘类不进场", async () => {
  const LIST = `
    <a href="/nw17239/20261017/aaaa.html">就业服务活动喊你来参加</a>
    <a href="/nw17239/20261016/bbbb.html">直播预告 静邻讲堂</a>
    <a href="/nw17239/20261012/cccc.html">普陀区文化活动预告（10.12-10.18）</a>`;
  const pages = {
    "https://www.shanghai.gov.cn/nw17239/20261017/aaaa.html": T1_HTML, // 有 2 场，但标题命中招聘类 → 不进场
    "https://www.shanghai.gov.cn/nw17239/20261016/bbbb.html": `
      <p>静邻讲堂</p><p>时间：10月16日14:00</p><p>地点：静安区图书馆</p>`, // 只有 1 场 → 丢弃
    "https://www.shanghai.gov.cn/nw17239/20261012/cccc.html": T1_HTML,
  };
  const fetched = [];
  const fetchHtml = async (url) => {
    fetched.push(url);
    if (!(url in pages)) throw new Error(`unexpected fetch ${url}`);
    return pages[url];
  };

  const events = await parseGovWeeklyEvents(LIST, source, { fetchHtml });
  assert.equal(events.length, 2);
  assert.deepEqual(fetched, ["https://www.shanghai.gov.cn/nw17239/20261012/cccc.html"]);
  assert.equal(events[0].category, "线下活动");
});

test("列表页：没有强特征文章时，只见 1 场的弱特征文章也要丢掉（防新闻稿误收）", async () => {
  const LIST = `<a href="/nw17239/20261016/bbbb.html">直播预告 静邻讲堂</a>`;
  const fetchHtml = async (url) => {
    assert.match(url, /bbbb\.html$/);
    return `<p>静邻讲堂：城市更新主题讲座</p><p>时间：10月16日14:00</p><p>地点：静安区图书馆</p>`;
  };
  const events = await parseGovWeeklyEvents(LIST, source, { fetchHtml });
  assert.equal(events.length, 0);
});

test("列表页：weeklyPages 决定翻页数（第 2 页才有的文章也能命中）", async () => {
  const page1 = `<a href="/nw17239/20261017/aaaa.html">便民提示</a>`;
  const page2 = `<a href="/nw17239/20261012/cccc.html">普陀区文化活动预告（10.12-10.18）</a>`;
  const fetched = [];
  const fetchHtml = async (url) => {
    fetched.push(url);
    if (url.endsWith("index_2.html")) return page2;
    if (url.endsWith("cccc.html")) return T1_HTML;
    throw new Error(`unexpected fetch ${url}`);
  };

  const events = await parseGovWeeklyEvents(page1, { ...source, weeklyPages: 2 }, { fetchHtml });
  assert.equal(events.length, 2);
  assert.deepEqual(fetched, [
    "https://www.shanghai.gov.cn/nw17239/index_2.html",
    "https://www.shanghai.gov.cn/nw17239/20261012/cccc.html",
  ]);
});

test("文章页：直接给正文时不发任何请求", async () => {
  const events = await parseGovWeeklyEvents(T1_HTML, { ...source, url: "https://www.shanghai.gov.cn/nw17239/20261012/cccc.html" }, {
    fetchHtml: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].source_name, source.name);
  assert.equal(events[0].signup_url, "https://www.shanghai.gov.cn/nw17239/20261012/cccc.html");
});
