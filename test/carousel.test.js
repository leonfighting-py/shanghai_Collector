import test from "node:test";
import assert from "node:assert/strict";

import { CAROUSEL_INTERVAL_MS, nextCarouselIndex } from "../src/lib/carousel.js";

test("carousel advances automatically every eight seconds", () => {
  assert.equal(CAROUSEL_INTERVAL_MS, 8000);
});

test("carousel wraps when moving forward and backward", () => {
  assert.equal(nextCarouselIndex(0, 1, 4), 1);
  assert.equal(nextCarouselIndex(3, 1, 4), 0);
  assert.equal(nextCarouselIndex(0, -1, 4), 3);
});
