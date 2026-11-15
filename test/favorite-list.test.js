import test from "node:test";
import assert from "node:assert/strict";

import { MAX_LIST_SLUGS, buildListParam, isValidSlug, parseListParam } from "../src/lib/favorite-list.js";

const A = "abc1234567";
const B = "xyz7654321";
const C = "ggnrg9aqvj";

test("点号分号都能解析，非法片段丢掉而不是整条拒绝", () => {
  assert.deepEqual(parseListParam(`${A}.${B}`), [A, B]);
  assert.deepEqual(parseListParam(`${A},${B}`), [A, B]);
  assert.deepEqual(parseListParam(`${A}.oops.${B}`), [A, B]);
  assert.deepEqual(parseListParam(""), []);
  assert.deepEqual(parseListParam(null), []);
});

test("带 -2 后缀的 slug 也认", () => {
  assert.ok(isValidSlug(`${A}-2`));
  assert.deepEqual(parseListParam(`${A}-2.${B}`), [`${A}-2`, B]);
});

test("去重并保持首次出现的顺序", () => {
  assert.deepEqual(parseListParam(`${A}.${B}.${A}`), [A, B]);
});

test("超过上限截断，URL 不会被撑爆", () => {
  const many = Array.from({ length: MAX_LIST_SLUGS + 20 }, (_, index) => String(index).padStart(10, "a"));
  assert.equal(parseListParam(many.join(".")).length, MAX_LIST_SLUGS);
});

test("大写、过短、带横杠的乱写一律不认", () => {
  assert.equal(isValidSlug("ABC1234567"), false);
  assert.equal(isValidSlug("abc123"), false);
  assert.equal(isValidSlug("abc-123456"), false);
  assert.equal(isValidSlug(""), false);
});

test("生成与解析可逆", () => {
  const slugs = [A, B, C];
  assert.equal(buildListParam(slugs), `${A}.${B}.${C}`);
  assert.deepEqual(parseListParam(buildListParam(slugs)), slugs);
});

test("生成时也会剔掉非法值", () => {
  assert.equal(buildListParam([A, "nope", B]), `${A}.${B}`);
  assert.equal(buildListParam([]), "");
});
