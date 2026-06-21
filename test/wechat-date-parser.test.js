import assert from "node:assert/strict";
import test from "node:test";

import {
  extractEventsFromArticleText,
  parseChineseEventDateRange,
} from "../src/lib/wechat-date-parser.js";

const SAMPLE_TEXT = `
6月魔都文娱活动TOP 15
乔治・莫兰迪：独白本世纪全球规模最大的莫兰迪个展登陆浦江畔。
日期：2026.06.17-10 月时间：日场 10:00-21:00（20:00 停止检票）/ 夜场 17:00-21:00地点：浦东美术馆（浦东新区滨江大道 2777 号）
林子祥 & 叶蒨文「白头到老」演唱会上海站华语乐坛殿堂级伉俪时隔 27 年再度合体开唱。
日期：2026 年 6 月 27 日 - 6 月 28 日时间：19:00地点：浦发银行东方体育中心
大张伟 “大好时光 - 我们伟大的人生” 演唱会上海站
日期：2026 年 6 月 20 日时间：19:00（时长约 120 分钟，以现场为准）地点：浦发银行东方体育中心（浦东新区耀体路 701 号）
`;

test("parseChineseEventDateRange handles dotted and full chinese ranges", () => {
  assert.deepEqual(parseChineseEventDateRange("2026.06.17-10 月"), {
    start_time: "2026-06-17T02:00:00.000Z",
    end_time: "2026-10-31T13:00:00.000Z",
  });

  assert.deepEqual(parseChineseEventDateRange("2026 年 6 月 27 日 - 6 月 28 日"), {
    start_time: "2026-06-27T02:00:00.000Z",
    end_time: "2026-06-28T13:00:00.000Z",
  });
});

test("extractEventsFromArticleText splits roundup posts into multiple events", () => {
  const events = extractEventsFromArticleText(SAMPLE_TEXT, {
    title: "6月魔都文娱活动TOP 15",
    publishTime: "2026-06-19T03:30:00.000Z",
    link: "https://mp.weixin.qq.com/s/example",
    accountName: "ShanghaiWOW",
  });

  assert.ok(events.length >= 3);
  assert.equal(events[0].title, "乔治・莫兰迪：独白");
  assert.equal(events[0].venue, "浦东美术馆（浦东新区滨江大道 2777 号）");
  assert.equal(events[0].category, "展览");
  assert.match(events[0].start_time, /^2026-06-17T02:00:00/);

  const concert = events.find((event) => event.title.includes("林子祥"));
  assert.ok(concert);
  assert.match(concert.start_time, /^2026-06-27T11:00:00/);

  const june20 = events.find((event) => event.title.includes("大张伟"));
  assert.ok(june20);
  assert.match(june20.start_time, /^2026-06-20T11:00:00/);
});

test("extractEventsFromArticleText falls back to article title when no structured blocks exist", () => {
  const events = extractEventsFromArticleText("活动详情请关注文末说明。", {
    title: "6月20日爵士开放麦",
    publishTime: "2026-06-01T10:00:00+08:00",
    link: "https://mp.weixin.qq.com/s/fallback",
    accountName: "上海爵士圈",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "6月20日爵士开放麦");
  assert.match(events[0].start_time, /^2026-06-20T02:00:00/);
});
