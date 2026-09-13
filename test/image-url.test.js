import test from "node:test";
import assert from "node:assert/strict";

import { isUsableImage, optimizedImageUrl, pickReferrerPolicy } from "../src/lib/image-url.js";

test("optimizedImageUrl compresses pipi.cn via imageMogr2 and strips old query", () => {
  assert.equal(
    optimizedImageUrl("https://p0.pipi.cn/mediaplus/x/abc.jpg?old=1"),
    "https://p0.pipi.cn/mediaplus/x/abc.jpg?imageMogr2/thumbnail/1200x/quality/75",
  );
});

test("optimizedImageUrl honors width/quality overrides on pipi.cn", () => {
  assert.equal(
    optimizedImageUrl("https://p0.pipi.cn/a/b.jpg", { width: 600, quality: 60 }),
    "https://p0.pipi.cn/a/b.jpg?imageMogr2/thumbnail/600x/quality/60",
  );
});

test("optimizedImageUrl leaves already-optimized hosts untouched", () => {
  const evbuc = "https://img.evbuc.com/https%3A%2F%2Fcdn.evbuc.com%2Fimg.jpg?w=512&q=75";
  assert.equal(optimizedImageUrl(evbuc), evbuc);
  const icity = "https://icity-static.icitycdn.com/images/uploads/x.jpg/178/105x105";
  assert.equal(optimizedImageUrl(icity), icity);
});

test("optimizedImageUrl passes through unoptimizable hosts (meituan/szmuseum)", () => {
  const mt = "https://p0.meituan.net/x/abc.png";
  assert.equal(optimizedImageUrl(mt), mt);
  const sz = "https://file.szmuseum.com/WaterMark/x.png";
  assert.equal(optimizedImageUrl(sz), sz);
});

test("optimizedImageUrl passes through non-http and invalid input", () => {
  assert.equal(optimizedImageUrl("/art/img.jpg"), "/art/img.jpg");
  assert.equal(optimizedImageUrl(undefined), undefined);
  assert.equal(optimizedImageUrl("not a url"), "not a url");
});

test("optimizedImageUrl routes through Cloudflare Image Resizing when opted in", () => {
  const prev = process.env.NEXT_PUBLIC_IMAGE_RESIZER;
  process.env.NEXT_PUBLIC_IMAGE_RESIZER = "cloudflare";
  try {
    assert.equal(
      optimizedImageUrl("https://p0.meituan.net/x/abc.png", { width: 600 }),
      "/cdn-cgi/image/width=600,quality=75,format=auto,fit=cover/https://p0.meituan.net/x/abc.png",
    );
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_IMAGE_RESIZER;
    else process.env.NEXT_PUBLIC_IMAGE_RESIZER = prev;
  }
});

test("isUsableImage accepts absolute http(s) only", () => {
  assert.equal(isUsableImage("https://a/x.jpg"), true);
  assert.equal(isUsableImage("http://a/x.jpg"), true);
  assert.equal(isUsableImage("/art/x.jpg"), false);
  assert.equal(isUsableImage(undefined), false);
  assert.equal(isUsableImage("  "), false);
});

test("pickReferrerPolicy sends origin referer for huodongxing CDN", () => {
  assert.equal(
    pickReferrerPolicy("https://cdn.huodongxing.com/logo/202609/123/456_v2small.jpg"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(pickReferrerPolicy("https://cdn-ip.allevents.in/s/img.jpg"), "no-referrer");
  assert.equal(pickReferrerPolicy("not a url"), "no-referrer");
});
