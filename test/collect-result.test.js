import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRunStatus,
  countFailedSources,
  shouldFailCollectProcess,
} from "../src/lib/collect-result.js";

test("collect process does not fail when a partial run publishes events", () => {
  const result = {
    ok: false,
    raw_inserted: 89,
    published_inserted: 23,
    failures: [{ source: "AllEvents Shanghai", message: "HTTP 403" }],
  };

  assert.equal(shouldFailCollectProcess(result), false);
});

test("collect process fails when no events were published", () => {
  const result = {
    ok: false,
    raw_inserted: 0,
    published_inserted: 0,
    failures: [{ source: "Broken", message: "fetch failed" }],
  };

  assert.equal(shouldFailCollectProcess(result), true);
});

// ---------- 运行状态分级（WP0-D） ----------

test("status success when no source failed", () => {
  assert.equal(
    classifyRunStatus({ guardAllowed: true, fellBackToOldData: false, failedSourceCount: 0, sourceCount: 261 }),
    "success",
  );
});

test("status success when failure ratio is exactly 5%", () => {
  // 5 / 100 = 0.05，"不超过 5%" 含边界 → success
  assert.equal(
    classifyRunStatus({ guardAllowed: true, fellBackToOldData: false, failedSourceCount: 5, sourceCount: 100 }),
    "success",
  );
});

test("status degraded when failure ratio exceeds 5%", () => {
  assert.equal(
    classifyRunStatus({ guardAllowed: true, fellBackToOldData: false, failedSourceCount: 6, sourceCount: 100 }),
    "degraded",
  );
  // 真实规模：261 个源挂 14 个（14/261 ≈ 5.4%）也该是 degraded
  assert.equal(
    classifyRunStatus({ guardAllowed: true, fellBackToOldData: false, failedSourceCount: 14, sourceCount: 261 }),
    "degraded",
  );
});

test("status blocked when publish guard rejected the run", () => {
  assert.equal(
    classifyRunStatus({ guardAllowed: false, fellBackToOldData: false, failedSourceCount: 0, sourceCount: 261 }),
    "blocked",
  );
});

test("status blocked when run fell back to previous data", () => {
  // 守门在这条路径上被人为置为 allowed，但线上内容没有更新 → 仍按 blocked 记
  assert.equal(
    classifyRunStatus({ guardAllowed: true, fellBackToOldData: true, failedSourceCount: 0, sourceCount: 261 }),
    "blocked",
  );
});

test("status blocked takes precedence over failure ratio", () => {
  assert.equal(
    classifyRunStatus({ guardAllowed: false, fellBackToOldData: false, failedSourceCount: 50, sourceCount: 100 }),
    "blocked",
  );
});

test("status with zero source count still classifies safely", () => {
  assert.equal(classifyRunStatus({ failedSourceCount: 0, sourceCount: 0 }), "success");
  assert.equal(classifyRunStatus({ failedSourceCount: 1, sourceCount: 0 }), "degraded");
});

// ---------- 失败信源统计 ----------

test("countFailedSources dedupes by source name", () => {
  const failures = [
    { source: "格瓦拉", message: "HTTP 403" },
    { source: "格瓦拉", message: "HTTP 403" },
    { source: "票牛", message: "fetch failed" },
  ];
  assert.equal(countFailedSources(failures), 2);
});

test("countFailedSources ignores run-level pseudo sources and sourceless entries", () => {
  const failures = [
    { source: "publish-guard", message: "guard rejected" },
    { message: "enrichment batch failed", indexes: [1, 2] },
    { source: "票牛", message: "fetch failed" },
  ];
  assert.equal(countFailedSources(failures), 1);
});

test("countFailedSources tolerates bad input", () => {
  assert.equal(countFailedSources(null), 0);
  assert.equal(countFailedSources(undefined), 0);
  assert.equal(countFailedSources([null, {}, { source: "" }]), 0);
});
