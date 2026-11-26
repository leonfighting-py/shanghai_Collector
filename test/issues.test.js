import test from "node:test";
import assert from "node:assert/strict";

import { ISSUE_HIGHLIGHT_FIELDS, buildIssueSnapshot } from "../src/lib/issues.js";

const NOW = new Date("2026-11-26T20:00:00+08:00");

function event(overrides = {}) {
  return {
    title: "测试展览",
    start_time: "2026-11-28T10:00:00+08:00",
    end_time: "2026-12-20T18:00:00+08:00",
    venue: "上海博物馆东馆",
    category: "展览",
    image_url: "https://example.com/a.jpg",
    summary: "摘要",
    slug: "aaaaaaaaaa",
    signup_url: "https://example.com/signup",
    source_name: "测试源",
    dedupe_key: "k1",
    ...overrides,
  };
}

test("快照只保留卡片字段，不把内部字段抄进归档", () => {
  const snapshot = buildIssueSnapshot([event()], { now: NOW });
  assert.equal(snapshot.highlights.length, 1);
  const row = snapshot.highlights[0];
  for (const field of ISSUE_HIGHLIGHT_FIELDS) {
    assert.ok(field in row, `缺少字段 ${field}`);
  }
  // 这几个是内部字段，归档里不该出现
  assert.equal("raw_event_ids" in row, false);
  assert.equal("dedupe_key" in row, false);
  assert.equal("source_url" in row, false);
});

test("没有封面的活动不进推荐，也就不会进快照", () => {
  const snapshot = buildIssueSnapshot(
    [event({ image_url: null, title: "无图活动", slug: "bbbbbbbbbb" }), event()],
    { now: NOW },
  );
  assert.equal(snapshot.highlights.length, 1);
  assert.equal(snapshot.highlights[0].slug, "aaaaaaaaaa");
});

test("期刊日期取上海当天，不随本地时区漂移", () => {
  const late = buildIssueSnapshot([event()], { now: new Date("2026-11-26T23:30:00+08:00") });
  assert.equal(late.issue_date, "2026-11-26");
  // UTC 还是 11-26 15:30，上海已经是 11-27 07:30
  const nextDay = buildIssueSnapshot([event()], { now: new Date("2026-11-26T23:30:00Z") });
  assert.equal(nextDay.issue_date, "2026-11-27");
});

test("label 与统计口径和首页一致", () => {
  const snapshot = buildIssueSnapshot(
    [
      event(),
      event({ slug: "cccccccccc", title: "第二个展览", venue: "西岸美术馆", category: "展览" }),
      event({ slug: "dddddddddd", title: "音乐会", venue: "上海大剧院", category: "演出音乐", start_time: "2026-12-01T19:30:00+08:00" }),
    ],
    { now: NOW },
  );
  assert.match(snapshot.label, /2026/);
  assert.equal(snapshot.stats.venues, 3);
  // 3 场都在窗口内、都没结束
  assert.equal(snapshot.stats.upcoming + snapshot.stats.ongoing, 3);
});

test("空数据也能生成快照，不会抛错", () => {
  const snapshot = buildIssueSnapshot([], { now: NOW });
  assert.deepEqual(snapshot.highlights, []);
  assert.equal(snapshot.stats.venues, 0);
  assert.equal(snapshot.issue_date, "2026-11-26");
});
