import test from "node:test";
import assert from "node:assert/strict";

import { shouldFailCollectProcess } from "../src/lib/collect-result.js";

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
