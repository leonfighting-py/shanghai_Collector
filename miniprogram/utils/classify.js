// 首页筛选面板用的**可选项列表**（二级分类 + 区域）。
//
// 真源是 src/lib/event-classify.js 的 SUBCATEGORIES / DISTRICTS。
// 小程序不能引用 src/，所以这里复制一份 —— 两边一旦不一致，
// test/miniprogram-classify-parity.test.js 会直接失败。
//
// 注意分工：这里**只有选项列表**，判定逻辑（classifySubcategory / detectDistrict）
// 跑在服务端，结果随 /api/events 的 subcategory / district 字段下发。

const DISTRICTS = [
  "黄浦",
  "徐汇",
  "长宁",
  "静安",
  "普陀",
  "虹口",
  "杨浦",
  "浦东",
  "闵行",
  "宝山",
  "嘉定",
  "松江",
  "青浦",
  "奉贤",
  "金山",
  "崇明",
];

const SUBCATEGORIES = {
  演出音乐: ["戏剧", "音乐会", "舞蹈", "喜剧脱口秀", "戏曲曲艺", "杂技马戏", "演唱会", "音乐节", "其他演出"],
  展览: ["艺术展", "文物历史", "摄影", "科技数字", "潮流动漫", "其他展览"],
  线下活动: ["市集", "运动户外", "手工体验", "亲子", "美食", "讲座沙龙", "社交聚会", "其他"],
  高校讲座: ["学术讲座", "论坛峰会", "招生开放日", "其他"],
  AI聚会: ["AI 技术", "黑客松", "AI 创业", "行业交流", "其他"],
};

// 二级分类挂在一级类目下，所以没选类目（=「全部」）时不给选项
function subcategoryOptions(category) {
  if (!category) return [];
  const list = SUBCATEGORIES[category] || [];
  return [{ value: "", label: "全部" }].concat(list.map((name) => ({ value: name, label: name })));
}

function districtOptions() {
  return [{ value: "", label: "全部" }].concat(DISTRICTS.map((name) => ({ value: name, label: name })));
}

module.exports = { DISTRICTS, SUBCATEGORIES, subcategoryOptions, districtOptions };
