import assert from "node:assert/strict";
import test from "node:test";

import { fetchArticlesFromWechatExporter, getWechatExporterConfig } from "../src/lib/wechat-exporter.js";
import { parseWechatOfficialAccounts } from "../src/lib/parsers/wechat.js";

test("wechat exporter config requires base url, auth key and accounts", () => {
  const previous = {
    base: process.env.WECHAT_EXPORTER_BASE_URL,
    key: process.env.WECHAT_EXPORTER_AUTH_KEY,
    accounts: process.env.WECHAT_EXPORTER_ACCOUNTS,
  };

  delete process.env.WECHAT_EXPORTER_BASE_URL;
  delete process.env.WECHAT_EXPORTER_AUTH_KEY;
  delete process.env.WECHAT_EXPORTER_ACCOUNTS;

  assert.equal(getWechatExporterConfig().enabled, false);

  process.env.WECHAT_EXPORTER_BASE_URL = "http://localhost:3000";
  process.env.WECHAT_EXPORTER_AUTH_KEY = "demo-key";
  process.env.WECHAT_EXPORTER_ACCOUNTS = "上海爵士圈";
  assert.equal(getWechatExporterConfig().enabled, true);

  if (previous.base) process.env.WECHAT_EXPORTER_BASE_URL = previous.base;
  else delete process.env.WECHAT_EXPORTER_BASE_URL;
  if (previous.key) process.env.WECHAT_EXPORTER_AUTH_KEY = previous.key;
  else delete process.env.WECHAT_EXPORTER_AUTH_KEY;
  if (previous.accounts) process.env.WECHAT_EXPORTER_ACCOUNTS = previous.accounts;
  else delete process.env.WECHAT_EXPORTER_ACCOUNTS;
});

test("wechat exporter maps article list into publishable events", async () => {
  const config = {
    enabled: true,
    baseUrl: "http://localhost:3000",
    authKey: "demo-key",
    accounts: ["上海爵士圈"],
    articleKeyword: "",
    includePattern: /爵士|活动/,
    excludePattern: null,
    pageSize: 20,
    maxPages: 1,
  };

  const articles = await fetchArticlesFromWechatExporter(config, {
    fetchJson: async (path) => {
      if (path.startsWith("/api/public/v1/account")) {
        return {
          base_resp: { ret: 0, err_msg: "ok" },
          list: [{ fakeid: "fake-1", nickname: "上海爵士圈" }],
        };
      }

      return {
        base_resp: { ret: 0, err_msg: "ok" },
        articles: [
          {
            title: "周末爵士开放麦",
            link: "https://mp.weixin.qq.com/s/example",
            update_time: 1718294400,
            author_name: "上海爵士圈",
          },
          {
            title: "今日天气",
            link: "https://mp.weixin.qq.com/s/weather",
            update_time: 1718294400,
            author_name: "上海爵士圈",
          },
        ],
      };
    },
  });

  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, "周末爵士开放麦");
  assert.equal(articles[0].account_name, "上海爵士圈");
});

test("wechat parser maps article list from middleware api", async () => {
  const previousUrl = process.env.WECHAT_EVENTS_API_URL;
  delete process.env.WECHAT_EXPORTER_AUTH_KEY;
  delete process.env.WECHAT_EXPORTER_ACCOUNTS;
  process.env.WECHAT_EVENTS_API_URL = "https://example.com/wechat/events";

  try {
    const events = await parseWechatOfficialAccounts("", {
      name: "微信公众号活动",
      url: "https://example.com/wechat/events",
      category: "线下活动",
    }, {
      fetchPayload: async () => ({
        articles: [
          {
            title: "周末爵士开放麦",
            publish_time: "2026-06-13T19:00:00+08:00",
            link: "https://mp.weixin.qq.com/s/example",
            account_name: "上海爵士圈",
            venue: "JZ Club",
          },
        ],
      }),
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].source_name, "公众号·上海爵士圈");
    assert.equal(events[0].venue, "JZ Club");
  } finally {
    if (previousUrl) process.env.WECHAT_EVENTS_API_URL = previousUrl;
    else delete process.env.WECHAT_EVENTS_API_URL;
  }
});
