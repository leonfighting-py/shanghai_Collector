import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DISTRICTS, SUBCATEGORIES, districtOptions, subcategoryOptions } from "../src/lib/event-classify.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const miniPath = path.join(root, "miniprogram/utils/classify.js");

// 小程序侧是 CommonJS，而仓库 package.json 是 type: module —— 直接 import 会被当 ESM 解析而报错。
// 该文件只做 `module.exports = { ... }`、没有任何 require，所以在当前上下文里求值即可。
function loadCommonJs(file) {
  const source = fs.readFileSync(file, "utf8");
  const module = { exports: {} };
  new Function("module", "exports", source)(module, module.exports);
  return module.exports;
}

// 护栏：小程序不能引用 src/，选项表只能复制一份，靠这条测试防止两边漂移。
test("小程序端的选项表与 src/lib/event-classify.js 完全一致（含顺序）", () => {
  const mini = loadCommonJs(miniPath);
  assert.deepEqual(mini.DISTRICTS, DISTRICTS, "DISTRICTS 漂移了");
  assert.deepEqual(mini.SUBCATEGORIES, SUBCATEGORIES, "SUBCATEGORIES 漂移了");
});

// 常量一致还不够：两端的选项构造函数（补「全部」、未知类目兜底）也必须产出同样的数组，
// 否则 Web 筛选面板和小程序面板会出现「选项个数/顺序不一样」这种很难看出来的一致性 bug。
test("两端选项构造函数的输出完全一致", () => {
  const mini = loadCommonJs(miniPath);
  const categories = ["", ...Object.keys(SUBCATEGORIES), "不存在的类目"];

  for (const category of categories) {
    assert.deepEqual(
      mini.subcategoryOptions(category),
      subcategoryOptions(category),
      `subcategoryOptions("${category}") 漂移了`,
    );
  }
  assert.deepEqual(mini.districtOptions(), districtOptions(), "districtOptions() 漂移了");
});

test("选项构造函数：前面补「全部」，未选类目时二级为空", () => {
  assert.deepEqual(subcategoryOptions(""), []);

  const subs = subcategoryOptions("展览");
  assert.equal(subs[0].value, "");
  assert.equal(subs[0].label, "全部");
  assert.equal(subs.length, SUBCATEGORIES.展览.length + 1);
  assert.equal(subs[1].value, SUBCATEGORIES.展览[0]);

  const districts = districtOptions();
  assert.equal(districts.length, DISTRICTS.length + 1);
  assert.equal(districts[0].value, "");
  assert.equal(districts[1].value, DISTRICTS[0]);
});
