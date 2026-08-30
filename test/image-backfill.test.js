import test from "node:test";
import assert from "node:assert/strict";

import { backfillEventImages, extractDetailImage } from "../src/lib/image-backfill.js";

const ogHtml = (url) => `<html><head><meta property="og:image" content="${url}"></head><body></body></html>`;

test("extractDetailImage prefers og:image and rejects junk images", () => {
  assert.equal(extractDetailImage(ogHtml("https://img.example.com/poster.jpg")), "https://img.example.com/poster.jpg");
  assert.equal(extractDetailImage(ogHtml("https://img.example.com/logo.png")), null);
  assert.equal(extractDetailImage(ogHtml("https://img.example.com/site-icon.png")), null);
});

test("extractDetailImage falls back to json-ld then first content image", () => {
  const jsonLd = `<script type="application/ld+json">{"@type":"Event","image":{"url":"https://img.example.com/ld.jpg"}}</script>`;
  assert.equal(extractDetailImage(jsonLd), "https://img.example.com/ld.jpg");

  const bodyImg = `<body><img src="/statics/img/common/logo.png"><img src="https://img.example.com/real.jpg"></body>`;
  assert.equal(extractDetailImage(bodyImg), "https://img.example.com/real.jpg");

  // 协议相对 URL 补全 https
  const relative = `<body><img src="//img.example.com/x.jpg"></body>`;
  assert.equal(extractDetailImage(relative), "https://img.example.com/x.jpg");
});

test("backfill only touches imageless events with http signup urls", async () => {
  const events = [
    { dedupe_key: "a", title: "已有图", signup_url: "https://example.com/a", image_url: "https://img/x.jpg" },
    { dedupe_key: "b", title: "无图", signup_url: "https://example.com/b" },
    { dedupe_key: "c", title: "非http", signup_url: "#" },
  ];

  const fetchHtml = async (url) => ogHtml(`https://img.example.com/${url.slice(-1)}.jpg`);
  const result = await backfillEventImages(events, { fetchHtml });

  assert.equal(result.attempted, 1);
  assert.equal(result.backfilled, 1);
  assert.equal(events[0].image_url, "https://img/x.jpg");
  assert.equal(events[1].image_url, "https://img.example.com/b.jpg");
  assert.equal(events[2].image_url, undefined);
});

test("backfill counts failures silently", async () => {
  const events = [
    { dedupe_key: "x", title: "抓取失败", signup_url: "https://example.com/x" },
    { dedupe_key: "y", title: "无图可提", signup_url: "https://example.com/y" },
  ];

  const result = await backfillEventImages(events, {
    fetchHtml: async (url) => {
      if (url.endsWith("x")) throw new Error("timeout");
      return "<html><body>无图</body></html>";
    },
  });

  assert.equal(result.attempted, 2);
  assert.equal(result.backfilled, 0);
  assert.equal(result.failed, 2);
  assert.equal(events[0].image_url, undefined);
});
