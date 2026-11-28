import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// remind-sender 的时间换算跑在云函数里（CommonJS），这里复制到临时 CJS 目录直接测。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "remind-sender-"));
fs.writeFileSync(path.join(workdir, "package.json"), JSON.stringify({ type: "commonjs" }));
fs.copyFileSync(
  path.join(root, "miniprogram/cloudfunctions/remind-sender/lib/schedule.js"),
  path.join(workdir, "schedule.js"),
);
const schedule = createRequire(path.join(workdir, "probe.cjs"))(path.join(workdir, "schedule.js"));

test.after(() => fs.rmSync(workdir, { recursive: true, force: true }));

test("shanghaiIso 与入库格式一致：YYYY-MM-DDTHH:mm:ss+08:00", () => {
  // 2026-12-04T10:00:00+08:00 == 2026-12-04T02:00:00Z
  const ms = new Date("2026-12-04T02:00:00Z").getTime();
  assert.equal(schedule.shanghaiIso(ms), "2026-12-04T10:00:00+08:00");
});

test("同一形状的 ISO 串可以直接比大小（查询靠这个）", () => {
  const earlier = schedule.shanghaiIso(new Date("2026-12-04T02:00:00Z").getTime());
  const later = schedule.shanghaiIso(new Date("2026-12-04T03:00:00Z").getTime());
  assert.ok(earlier < later);
  // 换成 UTC 的 Z 串就会错 8 小时，这里守一下：必须是 +08:00 结尾
  assert.ok(earlier.endsWith("+08:00"));
});

test("shiftDays：提前一天落在前一天 10:00", () => {
  assert.equal(schedule.shiftDays("2026-12-05", -1), "2026-12-04T10:00:00+08:00");
  assert.equal(schedule.shiftDays("2026-12-31", 3), "2027-01-03T10:00:00+08:00");
  assert.equal(schedule.shiftDays("2026-12-01", -1), "2026-11-30T10:00:00+08:00");
});

test("shiftDays 遇到坏日期返回 null，不抛错", () => {
  assert.equal(schedule.shiftDays("", -1), null);
  assert.equal(schedule.shiftDays("2026/12/05", -1), null);
});

test("提醒小时与小程序端规则一致（都是 10:00）", () => {
  const appSource = fs.readFileSync(path.join(root, "miniprogram/utils/reminders.js"), "utf8");
  assert.match(appSource, /REMIND_HOUR = 10/);
  assert.equal(schedule.REMIND_HOUR, 10);
});

test("clipThing 截到 20 字符", () => {
  const long = "一二三四五六七八九十一二三四五六七八九十一二三四五";
  assert.equal(schedule.clipThing(long).length, 20);
  assert.equal(schedule.clipThing("短"), "短");
});
