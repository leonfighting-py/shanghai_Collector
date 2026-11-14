import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assignSlugs, buildEventSlug, encodeBase32, normalizeUrlForSlug, sha1Bytes } from "../src/lib/event-slug.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hex = (bytes) => Buffer.from(bytes).toString("hex");

// 自己实现 sha1 是为了不依赖 node:crypto（云函数副本 / Workers 都要能跑），
// 所以必须逐字节对着标准实现验，别只看「能出 10 个字符」。
test("sha1 与 node:crypto 逐字节一致", () => {
  const samples = [
    "",
    "abc",
    "上海图书馆东馆|2026-11-20|上海图书馆东馆",
    "https://www.dianping.com/shanghai/ch10/g33927?utm=1",
    "a".repeat(1000),
  ];
  for (const sample of samples) {
    assert.equal(hex(sha1Bytes(sample)), createHash("sha1").update(sample, "utf8").digest("hex"), sample.slice(0, 20));
  }
});

test("base32 只出小写字母数字，长度可控", () => {
  const slug = encodeBase32(sha1Bytes("任意中文"), 10);
  assert.equal(slug.length, 10);
  assert.match(slug, /^[0-9a-hjkmnp-tv-z]+$/);
});

test("URL 规范化只合并同一页面的不同写法", () => {
  const cases = [
    ["https://www.example.com/a/b/", "example.com/a/b"],
    ["http://example.com/a/b#section", "example.com/a/b"],
    ["HTTPS://Example.COM/A", "example.com/A"],
    ["example.com/a?id=1", "example.com/a?id=1"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeUrlForSlug(input), expected, input);
  }
});

// 这条是整个 slug 存在的理由：LLM 富化会改写标题，改完 dedupe_key 就变了，
// 收藏和 URL 都不能跟着变。
test("标题被改写后 slug 不变", () => {
  const base = {
    title: "上图讲座：城市与记忆",
    start_time: "2026-11-20T19:00:00+08:00",
    venue: "上海图书馆东馆",
    source_url: "https://library.sh.cn/lecture/123",
  };
  const before = buildEventSlug(base);
  const after = buildEventSlug({ ...base, title: "城市与记忆——上图讲座（第 12 期）" });
  assert.equal(after, before);
});

test("同一页面不同写法得到同一个 slug", () => {
  const event = {
    start_time: "2026-11-20T19:00:00+08:00",
    venue: "上海图书馆东馆",
    source_url: "https://library.sh.cn/lecture/123/",
  };
  assert.equal(
    buildEventSlug(event),
    buildEventSlug({ ...event, source_url: "http://www.library.sh.cn/lecture/123#apply" }),
  );
});

test("日期或场馆变了 slug 跟着变（活动本身变了）", () => {
  const event = {
    start_time: "2026-11-20T19:00:00+08:00",
    venue: "上海图书馆东馆",
    source_url: "https://library.sh.cn/lecture/123",
  };
  const slug = buildEventSlug(event);
  assert.notEqual(buildEventSlug({ ...event, start_time: "2026-11-21T19:00:00+08:00" }), slug);
  assert.notEqual(buildEventSlug({ ...event, venue: "上海图书馆" }), slug);
});

// 日期按上海时区切：UTC 20 号 16:30 是上海 21 号 0:30，不能算成 20 号
test("跨零点按上海日期算", () => {
  const utc = buildEventSlug({
    start_time: "2026-11-20T16:30:00Z",
    venue: "MAO Livehouse",
    source_url: "https://mao.example.com/e/1",
  });
  const shanghai = buildEventSlug({
    start_time: "2026-11-21T00:30:00+08:00",
    venue: "MAO Livehouse",
    source_url: "https://mao.example.com/e/1",
  });
  assert.equal(utc, shanghai);
});

// gov-weekly 这类解析器把一篇「本周活动一览」展开成几十条，signup_url 完全相同；
// 同一天同一场馆的两场讲座必须各自成页，不能共用一个 slug。
test("同页同日同场馆的多场活动各自成页", () => {
  const shared = {
    start_time: "2026-11-21T14:00:00+08:00",
    venue: "上海少年儿童图书馆",
    source_url: "https://gov.example.com/weekly/42",
  };
  const [first, second, third] = assignSlugs([
    { ...shared, title: "亲子共读：秋天的树" },
    { ...shared, title: "绘本工作坊：影子戏" },
    { ...shared, title: "故事会：晚安月亮" },
  ]);
  const slugs = [first.slug, second.slug, third.slug];
  assert.equal(new Set(slugs).size, 3);
  assert.match(second.slug, /-2$/);
  assert.match(third.slug, /-3$/);
});

test("不撞的时候不加后缀", () => {
  const [event] = assignSlugs([
    { title: "任意", start_time: "2026-11-20T19:00:00+08:00", venue: "兰心大戏院", source_url: "https://a.example.com/1" },
  ]);
  assert.equal(event.slug, buildEventSlug(event));
  assert.doesNotMatch(event.slug, /-\d$/);
});

// 白名单漏一处就是「页面上的卡片链到 /e/undefined」，而单测全绿看不出来。
// 三处取字段的方式各不相同（数组常量），只能按源码抽出来比对。
test("slug 出现在三处字段白名单里", () => {
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const extract = (rel, name) => {
    const source = read(rel);
    const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    assert.ok(match, `${rel} 里没有找到 ${name}`);
    return match[1];
  };

  // API DTO：一行一个字段
  assert.match(extract("src/app/api/events/route.js", "PUBLIC_FIELDS"), /"slug"/);
  // 首页交给客户端的白名单
  assert.match(extract("src/app/page.js", "CLIENT_FIELDS"), /"slug"/);
});
