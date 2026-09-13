import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePublishGuard,
  getPublishGuardConfig,
  publishGuardFailure,
} from "../src/lib/publish-guard.js";
import { applyCategoryDropProtection } from "../src/lib/collect-job.js";

function events(n) {
  return Array.from({ length: n }, (_, i) => ({ title: `活动${i}` }));
}

test("guard allows normal publishes and cold starts", () => {
  // 冷启动：旧数据少于下限
  assert.equal(evaluatePublishGuard(events(5), events(3)).allowed, true);
  // 正常：新数据不少于旧的 60%
  assert.equal(evaluatePublishGuard(events(100), events(80)).allowed, true);
  // 持平
  assert.equal(evaluatePublishGuard(events(100), events(100)).allowed, true);
  // 增长
  assert.equal(evaluatePublishGuard(events(100), events(150)).allowed, true);
});

test("guard blocks publish when collection collapses", () => {
  const decision = evaluatePublishGuard(events(100), events(30));
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /^drop_below_/);

  // 空采集也拦截
  const empty = evaluatePublishGuard(events(100), events(0));
  assert.equal(empty.allowed, false);
  assert.equal(empty.reason, "empty_collection");
});

test("guard can be disabled or tuned via config", () => {
  assert.equal(evaluatePublishGuard(events(100), events(10), { enabled: false }).allowed, true);
  assert.equal(evaluatePublishGuard(events(100), events(50), { ratio: 0.5 }).allowed, true);
});

test("guard decision maps to a failure entry", () => {
  const decision = evaluatePublishGuard(events(100), events(30));
  const failure = publishGuardFailure(decision);
  assert.equal(failure.source, "publish-guard");
  assert.match(failure.message, /新 30 条/);
  assert.match(failure.message, /已发布 100 条/);
});

test("env config defaults to enabled at 0.6 ratio", () => {
  const config = getPublishGuardConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.ratio, 0.6);

  const disabled = getPublishGuardConfig({ PUBLISH_GUARD_ENABLED: "false" });
  assert.equal(disabled.enabled, false);

  const tuned = getPublishGuardConfig({ PUBLISH_GUARD_RATIO: "0.8" });
  assert.equal(tuned.ratio, 0.8);
});

function catEvents(category, n, suffix = "") {
  return Array.from({ length: n }, (_, i) => ({ title: `${category}${i}${suffix}`, category }));
}

test("category drop protection keeps previous data when a category collapses", () => {
  const previous = [...catEvents("高校讲座", 11), ...catEvents("演出音乐", 50)];
  // 本次讲座源集体挂掉：讲座只剩 2 条，演出正常 → 讲座应用旧数据顶替
  const next = [...catEvents("高校讲座", 2, "新"), ...catEvents("演出音乐", 48, "新")];
  const { events: merged, protectedCategories } = applyCategoryDropProtection(next, previous);
  assert.deepEqual(protectedCategories, ["高校讲座"]);
  const lectures = merged.filter((e) => e.category === "高校讲座");
  assert.equal(lectures.length, 11);
  assert.ok(lectures.every((e) => !e.title.includes("新")), "讲座应为旧数据");
  const shows = merged.filter((e) => e.category === "演出音乐");
  assert.equal(shows.length, 48);
  assert.ok(shows.every((e) => e.title.includes("新")), "演出应为本次新数据");
});

test("category drop protection is a no-op for normal fluctuations", () => {
  const previous = [...catEvents("高校讲座", 11), ...catEvents("演出音乐", 50)];
  const next = [...catEvents("高校讲座", 8, "新"), ...catEvents("演出音乐", 48, "新")];
  const { events: merged, protectedCategories } = applyCategoryDropProtection(next, previous);
  assert.deepEqual(protectedCategories, []);
  assert.equal(merged, next);
  assert.equal(merged.filter((e) => e.category === "高校讲座").length, 8);
});

test("category drop protection ignores categories below minimum threshold", () => {
  // 上次讲座仅 4 条（< 下限 5），本次归零也不保护
  const previous = [...catEvents("高校讲座", 4), ...catEvents("演出音乐", 50)];
  const next = [...catEvents("演出音乐", 48, "新")];
  const { events: merged, protectedCategories } = applyCategoryDropProtection(next, previous);
  assert.deepEqual(protectedCategories, []);
  assert.equal(merged.filter((e) => e.category === "高校讲座").length, 0);
});

test("category drop protection handles multiple collapsing categories", () => {
  const previous = [
    ...catEvents("高校讲座", 10),
    ...catEvents("展览", 20),
    ...catEvents("演出音乐", 50),
  ];
  const next = [...catEvents("演出音乐", 48, "新")];
  const { events: merged, protectedCategories } = applyCategoryDropProtection(next, previous);
  assert.deepEqual(protectedCategories.sort(), ["展览", "高校讲座"]);
  assert.equal(merged.filter((e) => e.category === "高校讲座").length, 10);
  assert.equal(merged.filter((e) => e.category === "展览").length, 20);
  assert.equal(merged.filter((e) => e.category === "演出音乐").length, 48);
});

test("category drop protection returns new events when no previous data", () => {
  const next = [...catEvents("高校讲座", 5), ...catEvents("演出音乐", 40)];
  const { events: merged, protectedCategories } = applyCategoryDropProtection(next, []);
  assert.deepEqual(protectedCategories, []);
  assert.equal(merged, next);
});
