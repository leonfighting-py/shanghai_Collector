import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePublishGuard,
  getPublishGuardConfig,
  publishGuardFailure,
} from "../src/lib/publish-guard.js";

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
