import test from "node:test";
import assert from "node:assert/strict";

import { DISTRICTS, SUBCATEGORIES, classifySubcategory, detectDistrict } from "../src/lib/event-classify.js";

test("二级分类：按一级类目给出细分", () => {
  const cases = [
    [{ category: "演出音乐", title: "维也纳之声金秋交响音乐会" }, "音乐会"],
    [{ category: "演出音乐", title: "环境式原创音乐剧《梅尔泉》" }, "戏剧"],
    [{ category: "演出音乐", title: "全男班街舞舞剧洗车行沉浸式驻场" }, "舞蹈"],
    [{ category: "演出音乐", title: "银河喜剧脱口秀-静安大悦城店" }, "喜剧脱口秀"],
    [{ category: "演出音乐", title: "沉浸式亲子魔术剧《幻梦奇缘》" }, "杂技马戏"],
    [{ category: "演出音乐", title: "京剧《霸王别姬》" }, "戏曲曲艺"],
    [{ category: "展览", title: "世界树之巅：美洲古代文明大展" }, "文物历史"],
    [{ category: "展览", title: "陈世英：他界之器艺术展" }, "艺术展"],
    [{ category: "展览", title: "乐见次元国漫沉浸乐园首展" }, "潮流动漫"],
    [{ category: "线下活动", title: "周末创意市集" }, "市集"],
    [{ category: "线下活动", title: "城市徒步 City Walk" }, "运动户外"],
    [{ category: "线下活动", title: "陶艺手作体验课" }, "手工体验"],
    [{ category: "高校讲座", title: "赵丹教授学术报告会" }, "学术讲座"],
    [{ category: "高校讲座", title: "2027 级研究生招生宣讲会" }, "招生开放日"],
    [{ category: "AI聚会", title: "大模型 Agent 开发实战" }, "AI 技术"],
    [{ category: "AI聚会", title: "48 小时黑客松" }, "黑客松"],
  ];
  for (const [event, expected] of cases) {
    assert.equal(classifySubcategory(event), expected, event.title);
  }
});

// 回归护栏：规则表里「戏剧」必须排在「喜剧脱口秀」之前。
// 踩过的坑：`原创音乐剧《邦尼帮你》` 的 summary 里带「喜剧」二字，
// 一旦顺序反了就会被判成脱口秀（venue 里的「邦尼剧场」也会踩同一条）。
test("顺序护栏：音乐剧不会被 summary / venue 里的「喜剧」抢成脱口秀", () => {
  const event = {
    category: "演出音乐",
    title: "原创音乐剧《邦尼帮你》上海热演",
    venue: "邦尼剧场",
    summary: "一部爆笑喜剧音乐剧，讲述小人物追梦的故事。",
  };
  assert.equal(classifySubcategory(event), "戏剧");
});

test("二级分类：识别不出规则时落回该类目的兜底名", () => {
  assert.equal(classifySubcategory({ category: "演出音乐", title: "ERA时空之旅2" }), "其他演出");
  assert.equal(classifySubcategory({ category: "展览", title: "卷帙匠心：古今书籍装帧美学" }), "其他展览");
  assert.equal(classifySubcategory({ category: "线下活动", title: "随机的名字" }), "其他");
});

test("二级分类：一级类目未知时返回空串", () => {
  assert.equal(classifySubcategory({ category: "不存在的类目", title: "某个活动" }), "");
  assert.equal(classifySubcategory({}), "");
});

test("区域：行政区名字面优先", () => {
  assert.equal(detectDistrict({ venue: "嘉定区图书馆一楼多功能厅" }), "嘉定");
  assert.equal(detectDistrict({ venue: "浦东历史博物馆（二层临展厅）" }), "浦东");
  assert.equal(detectDistrict({ venue: "虹口足球场" }), "虹口");
  assert.equal(detectDistrict({ venue: "黄浦文化中心·大上海剧场" }), "黄浦");
  assert.equal(detectDistrict({ venue: "静安大悦城" }), "静安");
});

test("区域：地标映射覆盖不写区名的场馆", () => {
  const cases = [
    ["上海博物馆人民广场馆一至三楼展厅", "黄浦"],
    ["上海民生现代美术馆", "静安"],
    ["龙美术馆 西岸馆", "徐汇"],
    ["中华艺术宫", "浦东"],
    ["宛平剧院", "徐汇"],
    ["上海图书馆淮海路馆3F 外文科技期刊阅览室", "徐汇"],
    ["天蟾逸夫舞台", "黄浦"],
    ["美琪大戏院", "静安"],
    ["上海交通大学机械与动力工程学院", "闵行"],
    ["国家会展中心（上海）", "青浦"],
  ];
  for (const [venue, expected] of cases) {
    assert.equal(detectDistrict({ venue }), expected, venue);
  }
});

// 回归护栏：同名前缀的特例必须排在前面，否则会被宽泛词吃掉。
test("顺序护栏：东馆 / 北外滩 / 南京东 vs 西", () => {
  assert.equal(detectDistrict({ venue: "上海博物馆东馆二楼中国东方航空第二特展厅" }), "浦东");
  assert.equal(detectDistrict({ venue: "上海图书馆东馆阅剧场" }), "浦东");
  assert.equal(detectDistrict({ venue: "上海博物馆" }), "黄浦");
  assert.equal(detectDistrict({ venue: "北外滩来福士" }), "虹口");
  assert.equal(detectDistrict({ venue: "南京东路 100 号" }), "黄浦");
  assert.equal(detectDistrict({ venue: "南京西路 100 号" }), "静安");
});

test("区域：识别不出时返回空串，不猜", () => {
  assert.equal(detectDistrict({ venue: "上海", title: "上海周六下午心理成长小组" }), "");
  assert.equal(detectDistrict({ venue: "", title: "" }), "");
  assert.equal(detectDistrict({}), "");
});

test("区域：同时出现多个区名时，返回 DISTRICTS 顺序里靠前的那个", () => {
  const district = detectDistrict({ venue: "静安与黄浦交界" });
  assert.ok(DISTRICTS.includes(district), district);
});

// 一致性护栏：规则产出的二级名必须是 SUBCATEGORIES 里的合法选项，
// 否则筛选面板上会出现「选不到的选项」或「选了没结果的选项」。
test("SUBCATEGORIES 覆盖规则的全部产出", () => {
  const samples = [
    { category: "演出音乐", title: "ERA时空之旅2" },
    { category: "演出音乐", title: "怀旧金曲音乐现场《时光唱片》" },
    { category: "演出音乐", title: "王者荣耀VR互动剧星海奇航" },
    { category: "展览", title: "金手匠艺：铁器时代金饰重生" },
    { category: "线下活动", title: "电影放映讲座浪浪山小妖怪" },
    { category: "高校讲座", title: "动态竞价策略与AI代理理论讲座" },
    { category: "AI聚会", title: "上海AI实验室科学智能研讨会" },
  ];
  for (const event of samples) {
    const sub = classifySubcategory(event);
    assert.ok(
      SUBCATEGORIES[event.category].includes(sub),
      `「${event.title}」判成「${sub}」，不在 ${event.category} 的选项里`,
    );
  }
});
