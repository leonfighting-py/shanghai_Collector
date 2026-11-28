import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 小程序端是 CommonJS，而仓库根 package.json 有 "type": "module"，
// 所以不能直接 import miniprogram/utils/*.js。
// 做法：把这些文件复制到一个带 {"type":"commonjs"} 的临时目录再 require ——
// 这样测的就是真正会打进小程序包的那份代码，不是复制品。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-reminders-"));
fs.mkdirSync(path.join(workdir, "utils"));
fs.writeFileSync(path.join(workdir, "package.json"), JSON.stringify({ type: "commonjs" }));
for (const file of ["reminders.js", "agenda.js", "format.js"]) {
  fs.copyFileSync(path.join(root, "miniprogram/utils", file), path.join(workdir, "utils", file));
}
const requireCjs = createRequire(path.join(workdir, "probe.cjs"));
const mp = requireCjs(path.join(workdir, "utils/reminders.js"));

test.after(() => fs.rmSync(workdir, { recursive: true, force: true }));

const NOW = new Date("2026-11-28T20:00:00+08:00").getTime();
const single = {
  title: "测试活动",
  start_time: "2026-12-05T19:30:00+08:00",
  end_time: null,
  venue: "上海大剧院",
};
const longRun = {
  title: "特展",
  start_time: "2026-11-01T10:00:00+08:00",
  end_time: "2026-12-31T18:00:00+08:00",
  venue: "上海博物馆东馆",
};

test("小程序端提醒时刻与 web 端规则一致", () => {
  assert.equal(mp.remindAtOf(single, NOW), "2026-12-04T10:00:00+08:00");
  assert.equal(mp.remindAtOf(longRun, NOW), "2026-12-28T10:00:00+08:00");
});

test("提醒时刻已过 / 活动已结束 → 不排", () => {
  assert.equal(mp.remindAtOf({ ...single, start_time: "2026-11-29T19:30:00+08:00" }, NOW), null);
  assert.equal(mp.remindAtOf({ ...longRun, end_time: "2026-11-20T18:00:00+08:00" }, NOW), null);
});

test("提醒键与收藏 id 同构：标题|上海日期|场馆", () => {
  assert.equal(mp.keyOf(single), "测试活动|2026-12-05|上海大剧院");
});

test("模板 thing 字段截到 20 字符，不会撑爆微信限制", () => {
  const long = "一二三四五六七八九十一二三四五六七八九十一二三四五";
  const clipped = mp.clipThing(long);
  assert.equal(clipped.length, 20);
  assert.ok(clipped.endsWith("…"));
  // 20 字符以内原样返回
  assert.equal(mp.clipThing("短标题"), "短标题");
});

test("date3 只能填单个日期：区间会被微信拒发", () => {
  const fields = mp.messageFor(longRun, mp.remindAtOf(longRun, NOW));
  assert.equal(fields.date3, "2026年12月31日");
  assert.ok(!fields.date3.includes("至"), "date 字段不能是区间");
});

test("thing4 是短说明，不重复日期也不被截断", () => {
  const singleFields = mp.messageFor(single, mp.remindAtOf(single, NOW));
  assert.equal(singleFields.thing4, "活动就要开始了，别错过");
  assert.ok(singleFields.thing4.length <= 20);
  const longFields = mp.messageFor(longRun, mp.remindAtOf(longRun, NOW));
  assert.equal(longFields.thing4, "展览即将闭展，别错过");
});

test("规则常量与 src/lib/reminders.js 对齐（防止两边算出不同时间）", () => {
  const web = fs.readFileSync(path.join(root, "src/lib/reminders.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "miniprogram/utils/reminders.js"), "utf8");
  for (const pattern of [/REMIND_HOUR = 10/, /LONG_RUN_MIN_DAYS = 14/, /LONG_RUN_LEAD_DAYS = 3/]) {
    assert.match(web, pattern);
    assert.match(app, pattern);
  }
});
