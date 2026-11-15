import test from "node:test";
import assert from "node:assert/strict";

import { buildCalendar, escapeText, foldLine } from "../src/lib/ical.js";

const SITE = "https://news.example.com";

function singleDay(overrides = {}) {
  return {
    slug: "abc1234567",
    title: "上海交响乐团开幕音乐会",
    start_time: "2026-11-16T19:30:00+08:00",
    end_time: null,
    venue: "上海交响乐团音乐厅",
    category: "演出音乐",
    source_name: "上海交响乐团",
    signup_url: "https://example.com/ticket/1",
    summary: "余隆指挥",
    ...overrides,
  };
}

function multiDay(overrides = {}) {
  return {
    slug: "xyz7654321",
    title: "青铜器常设展",
    start_time: "2026-11-10T09:00:00+08:00",
    end_time: "2026-12-30T17:00:00+08:00",
    venue: "上海博物馆东馆",
    category: "展览",
    source_name: "上海博物馆",
    signup_url: "https://example.com/visit",
    summary: "",
    ...overrides,
  };
}

/** 把折行还原，顺便检查每行物理长度 */
function unfold(text) {
  const physical = text.split("\r\n");
  for (const line of physical) {
    assert.ok(
      Buffer.byteLength(line, "utf8") <= 75,
      `物理行超过 75 字节：${line}（${Buffer.byteLength(line, "utf8")}）`,
    );
  }
  const logical = [];
  for (const line of physical) {
    if (line.startsWith(" ") && logical.length > 0) logical[logical.length - 1] += line.slice(1);
    else logical.push(line);
  }
  return logical;
}

test("单日活动按上海时区写，时间不偏 8 小时", () => {
  const calendar = buildCalendar([singleDay()], { siteUrl: SITE });
  assert.match(calendar, /DTSTART;TZID=Asia\/Shanghai:20261116T193000/);
});

test("同一时刻用 UTC 写法进来，结果一致", () => {
  // 19:30 +08:00 == 11:30Z
  const calendar = buildCalendar([singleDay({ start_time: "2026-11-16T11:30:00Z" })], { siteUrl: SITE });
  assert.match(calendar, /DTSTART;TZID=Asia\/Shanghai:20261116T193000/);
});

test("没有结束时间的单场活动默认 2 小时", () => {
  const calendar = buildCalendar([singleDay()], { siteUrl: SITE });
  assert.match(calendar, /DTEND;TZID=Asia\/Shanghai:20261116T213000/);
});

test("有结束时间就按结束时间收尾，不会退化成 2 小时", () => {
  const calendar = buildCalendar([singleDay({ end_time: "2026-11-16T22:00:00+08:00" })], { siteUrl: SITE });
  assert.match(calendar, /DTEND;TZID=Asia\/Shanghai:20261116T220000/);
});

test("跨天活动写成全天事件，DTEND 是排他的次日", () => {
  const calendar = buildCalendar([multiDay()], { siteUrl: SITE });
  assert.match(calendar, /DTSTART;VALUE=DATE:20261110/);
  // 12.30 是最后一天，DTEND 必须写 12.31（RFC 5545 的 DTEND 排他）
  assert.match(calendar, /DTEND;VALUE=DATE:20261231/);
  assert.doesNotMatch(calendar, /DTSTART;TZID=Asia\/Shanghai:20261110/);
});

test("跨天活动把开场时间写进描述", () => {
  const calendar = buildCalendar([multiDay()], { siteUrl: SITE });
  assert.match(calendar, /每天 09:00 开场/);
});

test("逗号、分号、反斜杠、换行都转义", () => {
  assert.equal(escapeText("A,B;C\\D\nE"), "A\\,B\\;C\\\\D\\nE");
  const calendar = buildCalendar([singleDay({ title: "音乐,舞蹈;戏剧\\沙龙" })], { siteUrl: SITE });
  assert.match(unfold(calendar).find((line) => line.startsWith("SUMMARY:")) || "", /^SUMMARY:音乐\\,舞蹈\\;戏剧\\\\沙龙$/);
});

test("长中文标题按字节折行，展开后与原文一致", () => {
  const title = "上海当代艺术博物馆特别展览：介于之间的城市记忆与未来想象——第十二届上海双年展主题展";
  const calendar = buildCalendar([singleDay({ title })], { siteUrl: SITE });
  const physical = calendar.split("\r\n");
  const folded = physical.filter((line) => line.startsWith(" "));
  assert.ok(folded.length > 0, "中文长标题应该被折行");
  const summary = unfold(calendar).find((line) => line.startsWith("SUMMARY:"));
  assert.equal(summary, `SUMMARY:${escapeText(title)}`);
});

test("折行不会把多字节字符劈开", () => {
  const line = "SUMMARY:" + "中".repeat(40);
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) {
    assert.ok(Buffer.byteLength(part, "utf8") <= 75);
    assert.doesNotMatch(part, /�/);
  }
  assert.equal(folded.replace(/\r\n /g, ""), line);
});

test("CRLF 行尾、固定头尾、带 VTIMEZONE", () => {
  const calendar = buildCalendar([singleDay()], { siteUrl: SITE });
  assert.ok(calendar.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
  assert.ok(calendar.includes("TZID:Asia/Shanghai"));
  assert.match(calendar, /TZOFFSETFROM:\+0800\r\n TZOFFSETTO:\+0800|TZOFFSETFROM:\+0800\r\nTZOFFSETTO:\+0800/);
  assert.doesNotMatch(calendar.replace(/\r\n/g, ""), /\n/, "除了 CRLF 之外不能有裸换行");
});

test("UID 用 slug，详情页地址进 URL 和描述", () => {
  const calendar = buildCalendar([singleDay()], { siteUrl: SITE });
  assert.match(calendar, /UID:abc1234567@news\.example\.com/);
  assert.match(calendar, /URL:https:\/\/news\.example\.com\/e\/abc1234567/);
  assert.match(calendar, /详情：https:\/\/news\.example\.com\/e\/abc1234567/);
});

test("开始时间坏的条目被跳过，空清单仍出合法日历", () => {
  const calendar = buildCalendar([singleDay({ start_time: "not-a-date" })], { siteUrl: SITE });
  assert.equal(calendar.match(/BEGIN:VEVENT/g), null);
  assert.ok(calendar.includes("BEGIN:VCALENDAR"));
  assert.ok(calendar.includes("END:VCALENDAR"));
});

test("多条活动各自一个 VEVENT", () => {
  const calendar = buildCalendar([singleDay(), multiDay()], { siteUrl: SITE });
  assert.equal(calendar.match(/BEGIN:VEVENT/g).length, 2);
  assert.equal(calendar.match(/END:VEVENT/g).length, 2);
});
