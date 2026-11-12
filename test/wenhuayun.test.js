import test from "node:test";
import assert from "node:assert/strict";

import { parseWenhuayunEvents, parseWenhuayunList } from "../src/lib/parsers/wenhuayun.js";

const source = {
  name: "上海文化云·活动报名",
  url: "https://www.wenhuayun.cn/ticketActivity/ticketActivityListLoad.do?page=1",
  category: "线下活动",
  tier: "T2",
  defaultVenue: "上海",
};

function card({ id, title, venue, date }) {
  return `<li data-li-url="http://example.com/${id}.jpg">
    <a href="/ticketActivity/ticketActivityDetail.do?activityId=${id}" class="img"><img src="x.jpg" /></a>
    <div class="info">
      <h1><a href="/ticketActivity/ticketActivityDetail.do?activityId=${id}">${title}</a></h1>
      <div class="text">
        <p>地址： ${venue} </p>
        <p>时间： ${date} </p>
      </div>
    </div>
  </li>`;
}

const LIST_HTML = `<ul class="activity_ul" id="data-ul">
  ${card({ id: "a1", title: "秋月枫舍居民区-消防安全知识讲座", venue: "镇坪路176弄14号", date: "2026-10-19" })}
  ${card({ id: "a2", title: "云间有书读书会 知白守黑——文字的温度和力量", venue: "松江区人民南路6弄69号", date: "2026-10-21" })}
</ul>
<input type="hidden" id="pages" value="1">
<input type="hidden" id="countpage" value="1">
<input type="hidden" id="total" value="2">`;

test("文化云：卡片解析出标题/地址/日期，时间补 10:00", () => {
  const events = parseWenhuayunList(LIST_HTML, source);
  assert.equal(events.length, 2);
  assert.equal(events[0].title, "秋月枫舍居民区-消防安全知识讲座");
  assert.equal(events[0].start_time, "2026-10-19T02:00:00.000Z"); // 10:00 +08:00
  assert.equal(events[0].venue, "镇坪路176弄14号");
  assert.equal(events[0].category, "线下活动");
  assert.match(events[0].signup_url, /activityId=a1$/);
});

test("文化云：缺日期或标题的卡片直接跳过", () => {
  const html = `<ul>
    ${card({ id: "b1", title: "没有日期的活动", venue: "某地址", date: "时间待定" })}
    <li data-li-url="x"><h1><a href="/x">短</a></h1><p>时间：2026-10-20</p></li>
  </ul>`;
  assert.equal(parseWenhuayunList(html, source).length, 0);
});

test("文化云：按 countpage 翻页，且结果按 signup_url 去重", async () => {
  const page1 = LIST_HTML.replace('value="1">\n<input type="hidden" id="total"', 'value="2">\n<input type="hidden" id="total"');
  const page2Html = `<ul>
    ${card({ id: "a1", title: "秋月枫舍居民区-消防安全知识讲座", venue: "镇坪路176弄14号", date: "2026-10-19" })}
    ${card({ id: "a3", title: "老西门社区影院《蝶影追踪》", venue: "老西门文化中心", date: "2026-10-22" })}
  </ul>`;
  const fetched = [];
  const events = await parseWenhuayunEvents(page1, source, {
    fetchHtml: async (url) => {
      fetched.push(url);
      return page2Html;
    },
  });
  assert.deepEqual(fetched, ["https://www.wenhuayun.cn/ticketActivity/ticketActivityListLoad.do?page=2"]);
  // 首页 2 条 + 第 2 页 2 条，其中 a1 两页重复 → 去重后 3 条
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.title).sort(), ["云间有书读书会 知白守黑——文字的温度和力量", "秋月枫舍居民区-消防安全知识讲座", "老西门社区影院《蝶影追踪》"]);
});

test("文化云：countpage 缺失时只解析首页，不发额外请求", async () => {
  const html = `<ul>${card({ id: "c1", title: "公益电影《飞行家》", venue: "延长西路350号", date: "2026-10-19" })}</ul>`;
  let called = 0;
  const events = await parseWenhuayunEvents(html, source, {
    fetchHtml: async () => {
      called += 1;
      return "";
    },
  });
  assert.equal(events.length, 1);
  assert.equal(called, 0);
});
