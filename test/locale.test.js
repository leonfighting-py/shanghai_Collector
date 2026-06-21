import test from "node:test";
import assert from "node:assert/strict";

import { hasCjkText, isChinesePreferredEvent } from "../src/lib/locale.js";

test("detects CJK characters in titles", () => {
  assert.equal(hasCjkText("周末爵士现场"), true);
  assert.equal(hasCjkText("Jazz Night Live"), false);
  assert.equal(hasCjkText("AI 创业者交流"), true);
});

test("marks events with Chinese titles as preferred", () => {
  assert.equal(isChinesePreferredEvent({ title: "当代艺术开幕展" }), true);
  assert.equal(isChinesePreferredEvent({ title: "Networking Night" }), false);
});
