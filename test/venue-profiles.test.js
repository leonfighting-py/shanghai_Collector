import test from "node:test";
import assert from "node:assert/strict";

import { isVagueVenue, matchVenue, normalizeVenueName, resolveVenueName } from "../src/lib/venue-profiles.js";

test("长别名优先：东馆不能被「上海博物馆」抢走", () => {
  // 两个别名都在字符串里，只能靠长度决胜
  assert.equal(matchVenue("上海博物馆东馆三楼中国古代陶瓷馆尾厅")?.district, "浦东");
  assert.equal(matchVenue("上海博物馆人民广场馆一至三楼展厅")?.district, "黄浦");
  assert.equal(matchVenue("上海图书馆东馆7楼阅读推广区")?.district, "浦东");
  assert.equal(matchVenue("上海图书馆淮海路馆3楼外文科技期刊阅览室")?.district, "徐汇");
});

test("带厅名、分店、楼层、全半角都能命中", () => {
  const cases = [
    ["上海文化广场 主剧场", "黄浦"],
    ["复兴中路 597号 上海文化广场主剧场", "黄浦"],
    ["上海市黄浦区马当路245号 新天地时尚二期B1 赫兹星球·新天地剧场", "黄浦"],
    ["世博大道1200号 梅赛德斯-奔驰文化中心", "浦东"],
    ["上海梅赛德斯奔驰文化中心（上海世博文化中心）", "浦东"],
    ["上海新国际博览中心   Shanghai New International Expo Center", "浦东"],
    ["Shanghai New International Expo Centre (SNIEC)", "浦东"],
    ["上海新國際博覽中心", "浦东"],
    ["西岸美术馆 展厅3", "徐汇"],
    ["上海宝龙美术馆8号厅", "闵行"],
    ["上海科技大学·Y楼报告厅", "浦东"],
  ];
  for (const [venue, expected] of cases) {
    assert.equal(matchVenue(venue)?.district, expected, venue);
  }
});

// 场馆字典只收「场馆」。把活动名收进来会把一堆无关活动判成某个区。
test("活动名 / 展览名不命中场馆字典", () => {
  assert.equal(matchVenue("CHIIKAWA DAYS 特展- 中国内地首展"), null);
  assert.equal(matchVenue("沉浸式金鱼剧场艺术展"), null);
  assert.equal(matchVenue("ERA-时空之旅2"), null);
  assert.equal(matchVenue("上海"), null);
  assert.equal(matchVenue(""), null);
});

test("浦东历史博物馆不能被「历史博物馆」误伤", () => {
  assert.equal(matchVenue("浦东历史博物馆（二层临展厅）"), null);
});

test("场馆名归一化不吃空格与标点", () => {
  assert.equal(normalizeVenueName("上海·文化广场（主剧场）"), "上海文化广场主剧场");
  assert.equal(normalizeVenueName("ＳＮＩＥＣ"), "sniec");
});

test("「上海」这种等于没说的场馆名", () => {
  assert.equal(isVagueVenue("上海"), true);
  assert.equal(isVagueVenue("上海市"), true);
  assert.equal(isVagueVenue(""), true);
  assert.equal(isVagueVenue("上海大剧院"), false);
});

test("场馆模糊时用地址反查字典场馆名", () => {
  assert.equal(
    resolveVenueName({ venue: "上海", address: "上海市黄浦区人民大道300号 上海大剧院" }),
    "上海大剧院",
  );
});

test("地址反查不到场馆名时，场馆直接改成地址", () => {
  assert.equal(
    resolveVenueName({ venue: "上海", address: "上海市普陀区华阴路200号" }),
    "上海市普陀区华阴路200号",
  );
});

test("场馆已经是具体名字时不动它（厅名是有用信息）", () => {
  assert.equal(resolveVenueName({ venue: "上海文化广场 主剧场", address: "复兴中路597号" }), "上海文化广场 主剧场");
});

test("场馆模糊又没有地址时保持原样", () => {
  assert.equal(resolveVenueName({ venue: "上海", address: "" }), "上海");
  assert.equal(resolveVenueName({ venue: "上海" }), "上海");
});
