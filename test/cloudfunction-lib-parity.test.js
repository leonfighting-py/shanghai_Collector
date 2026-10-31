import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// 云函数上传时只带 miniprogram/cloudfunctions/events/ 目录，所以 src/lib 的纯函数必须复制一份进去。
// 副本唯一允许的差异是 import 的扩展名（.js → .mjs：Node 里 .mjs 才按 ESM 解析）。
// 这条护栏防的是"改了 src/lib 忘了同步副本"——那会让小程序和 Web 端算出不同的集合。
// events.js 的依赖闭包共 4 个文件（event-classify.js / event-duration.js 也是纯函数）。
const LIB_COPIES = [
  ["events.js", "events.mjs"],
  ["dedupe.js", "dedupe.mjs"],
  ["event-classify.js", "event-classify.mjs"],
  ["event-duration.js", "event-duration.mjs"],
];

function toMjs(source) {
  return source.replace(/from "\.\/([A-Za-z0-9_-]+)\.js"/g, 'from "./$1.mjs"');
}

test("云函数的 lib/ 是 src/lib 的原样副本（仅 import 扩展名不同）", () => {
  for (const [source, copy] of LIB_COPIES) {
    assert.equal(
      read(`miniprogram/cloudfunctions/events/lib/${copy}`),
      toMjs(read(`src/lib/${source}`)),
      `${copy} 与 src/lib/${source} 不一致：重新 cp 一份，再把 import 改成 .mjs`,
    );
  }
});

// 多一份少一份都看不出来：少了会在运行时 ERR_MODULE_NOT_FOUND，多了只是无用文件
test("lib/ 目录的文件集合恰好等于依赖闭包", () => {
  const actual = fs
    .readdirSync(path.join(root, "miniprogram/cloudfunctions/events/lib"))
    .filter((name) => name.endsWith(".mjs"))
    .sort();
  assert.deepEqual(actual, LIB_COPIES.map(([, copy]) => copy).sort());
});

function extractArray(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `没有找到 ${name}`);
  return new Function(`return [${match[1]}]`)();
}

// 两边 DTO 字段不一致时，小程序走云函数和走云托管会看到不同的字段集
test("云函数与云托管的公开 DTO 字段一致（含顺序）", () => {
  const cloudrun = extractArray(read("cloudrun/server.js"), "PUBLIC_FIELDS");
  const cloudFunction = extractArray(read("miniprogram/cloudfunctions/events/index.js"), "PUBLIC_FIELDS");
  assert.deepEqual(cloudFunction, cloudrun);
});

function extractWindowSql(source, label) {
  const match = source.match(
    /function buildEventWindowWhereSql\(startParam, endParam\) \{\s*return `([\s\S]*?)`;\s*\}/,
  );
  assert.ok(match, `${label} 里没有找到 buildEventWindowWhereSql`);
  return match[1].trim();
}

// 时间窗口口径写错会把「展期中」的活动整批漏掉（历史上就是这条出过事）
test("发布/读取的时间窗口 SQL 与云托管一致", () => {
  assert.equal(
    extractWindowSql(read("miniprogram/cloudfunctions/events/index.js"), "miniprogram/cloudfunctions/events/index.js"),
    extractWindowSql(read("cloudrun/server.js"), "cloudrun/server.js"),
  );
});

function extractSelectFields(source, label) {
  const match = source.match(/select ([\s\S]*?) from events/);
  assert.ok(match, `${label} 里没有找到 events 的 select`);
  return match[1].replace(/\s+/g, " ").trim();
}

// select 少了字段（比如 sources / image_url）不会报错，只会静默变空，最难发现
test("云函数与云托管的 select 字段一致", () => {
  assert.equal(
    extractSelectFields(read("miniprogram/cloudfunctions/events/index.js"), "miniprogram/cloudfunctions/events/index.js"),
    extractSelectFields(read("cloudrun/server.js"), "cloudrun/server.js"),
  );
});
