// 场馆字典：场馆名 → 区域 / 是否室内 / 别名。
//
// 为什么要它：`detectDistrict` 原来只靠地标正则，遇到「上海文化广场 主剧场」「上海博物馆东馆三楼…」
// 这类带厅名的写法就得靠一堆特例；而且场馆名本身是判定区域最可靠的线索，正则匹配标题容易误伤。
//
// 匹配规则：归一化后**子串匹配，最长的别名优先**。
// 「上海博物馆东馆三楼中国古代陶瓷馆尾厅」必须命中「上海博物馆东馆」（浦东），
// 不能命中「上海博物馆」（黄浦）——两者都在字符串里，只能靠长度决胜。
//
// ⚠️ 只收**确实是场馆**的名字。像「CHIIKAWA DAYS 特展- 中国内地首展」「沉浸式金鱼剧场艺术展」
// 这种是活动名，收进来会把别的活动一并判成某个区，留给详情页地址解决。
//
// metro / hours / lat / lng 这一批先留空：经纬度第 15 天批量地理编码，
// 地铁站与开放时间没有可靠来源，宁可空着也不猜（空 = 不知道）。

export const VENUE_PROFILES = [
  // —— 浦东 ——
  { name: "上海博物馆东馆", aliases: ["上博东馆"], district: "浦东", indoor: true },
  { name: "上海图书馆东馆", aliases: ["上图东馆"], district: "浦东", indoor: true },
  { name: "中华艺术宫", aliases: ["世博会中国馆"], district: "浦东", indoor: true },
  { name: "浦东美术馆", aliases: ["MAP"], district: "浦东", indoor: true },
  { name: "上海科技馆", district: "浦东", indoor: true },
  { name: "上海天文馆", district: "浦东", indoor: true },
  { name: "震旦博物馆", district: "浦东", indoor: true },
  { name: "喜玛拉雅美术馆", district: "浦东", indoor: true },
  { name: "昊美术馆", district: "浦东", indoor: true },
  { name: "中国航海博物馆", district: "浦东", indoor: true },
  { name: "上海东方艺术中心", aliases: ["东方艺术中心"], district: "浦东", indoor: true },
  { name: "上海大歌剧院", district: "浦东", indoor: true },
  { name: "梅赛德斯-奔驰文化中心", aliases: ["梅赛德斯奔驰文化中心", "奔驰文化中心", "世博文化中心"], district: "浦东", indoor: true },
  { name: "东方体育中心", aliases: ["浦发银行东方体育中心"], district: "浦东", indoor: true },
  { name: "上海世博展览馆", aliases: ["世博展览馆"], district: "浦东", indoor: true },
  {
    name: "上海新国际博览中心",
    aliases: ["新国际博览中心", "SNIEC", "Shanghai New International Expo Cent", "上海新國際博覽中心"],
    district: "浦东",
    indoor: true,
  },
  { name: "前滩31", aliases: ["前滩三十一"], district: "浦东", indoor: true },
  { name: "龙美术馆浦东馆", aliases: ["龙美术馆 浦东馆"], district: "浦东", indoor: true },
  { name: "上海中心", aliases: ["上海中心大厦"], district: "浦东" },
  { name: "观复博物馆", district: "浦东", indoor: true },
  { name: "世博文化公园", district: "浦东", indoor: false },
  { name: "上海科技大学", aliases: ["上科大"], district: "浦东", indoor: true },

  // —— 黄浦 ——
  { name: "上海博物馆", aliases: ["上海博物馆人民广场馆", "上博人民广场馆"], district: "黄浦", indoor: true },
  { name: "上海当代艺术博物馆", aliases: ["PSA", "当代艺术博物馆"], district: "黄浦", indoor: true },
  { name: "上海大剧院", district: "黄浦", indoor: true },
  { name: "上海文化广场", aliases: ["上汽·上海文化广场"], district: "黄浦", indoor: true },
  { name: "凯迪拉克·上海音乐厅", aliases: ["上海音乐厅"], district: "黄浦", indoor: true },
  { name: "兰心大戏院", aliases: ["兰心大戏院"], district: "黄浦", indoor: true },
  { name: "人民大舞台", district: "黄浦", indoor: true },
  { name: "天蟾逸夫舞台", aliases: ["天蟾"], district: "黄浦", indoor: true },
  { name: "大世界", aliases: ["上海大世界"], district: "黄浦", indoor: true },
  { name: "亚洲大厦", aliases: ["星空间"], district: "黄浦", indoor: true },
  { name: "上海外滩美术馆", aliases: ["外滩美术馆", "RAM"], district: "黄浦", indoor: true },
  { name: "复星艺术中心", district: "黄浦", indoor: true },
  { name: "上海民生现代美术馆", aliases: ["民生现代美术馆"], district: "黄浦", indoor: true },
  { name: "上海当代艺术馆", aliases: ["MoCA"], district: "黄浦", indoor: true },
  // 别名不能只写「历史博物馆」：「浦东历史博物馆」会被它命中，判成黄浦
  { name: "上海市历史博物馆", district: "黄浦", indoor: true },
  { name: "中共一大纪念馆", aliases: ["一大纪念馆"], district: "黄浦", indoor: true },
  { name: "K11购物艺术中心", aliases: ["K11", "chi K11美术馆"], district: "黄浦", indoor: true },
  { name: "新天地", district: "黄浦" },
  { name: "思南公馆", district: "黄浦" },
  { name: "豫园", aliases: ["海上梨园"], district: "黄浦" },
  { name: "老西门文化中心", district: "黄浦", indoor: true },
  { name: "黄浦区文化馆", district: "黄浦", indoor: true },

  // —— 徐汇 ——
  { name: "上海交响乐团音乐厅", aliases: ["上交音乐厅", "捷豹上海交响音乐厅"], district: "徐汇", indoor: true },
  { name: "上海话剧艺术中心", aliases: ["话剧艺术中心"], district: "徐汇", indoor: true },
  { name: "宛平剧院", district: "徐汇", indoor: true },
  { name: "西岸美术馆", district: "徐汇", indoor: true },
  { name: "龙美术馆", aliases: ["龙美术馆 西岸馆", "龙美术馆西岸馆"], district: "徐汇", indoor: true },
  { name: "余德耀美术馆", district: "青浦", indoor: true },
  { name: "油罐艺术中心", district: "徐汇", indoor: true },
  { name: "星美术馆", district: "徐汇", indoor: true },
  { name: "西岸艺术中心", district: "徐汇", indoor: true },
  { name: "西岸大剧院", aliases: ["上海西岸大剧院"], district: "徐汇", indoor: true },
  { name: "西岸国际会展中心", district: "徐汇", indoor: true },
  { name: "上海电影博物馆", district: "徐汇", indoor: true },
  { name: "上海图书馆", aliases: ["上海图书馆淮海路馆", "上图淮海路馆"], district: "徐汇", indoor: true },
  { name: "上音歌剧院", district: "徐汇", indoor: true },
  { name: "贺绿汀音乐厅", district: "徐汇", indoor: true },
  { name: "上海音乐学院", district: "徐汇", indoor: true },
  { name: "上海体育场", aliases: ["八万人体育场"], district: "徐汇", indoor: false },
  { name: "中国近现代新闻出版博物馆", aliases: ["新闻出版博物馆"], district: "杨浦", indoor: true },

  // —— 静安 ——
  { name: "上海展览中心", district: "静安", indoor: true },
  { name: "美琪大戏院", district: "静安", indoor: true },
  { name: "上海自然博物馆", district: "静安", indoor: true },
  { name: "上海马戏城", aliases: ["马戏城"], district: "静安", indoor: true },
  { name: "大宁剧院", district: "静安", indoor: true },
  { name: "艺海剧院", district: "静安", indoor: true },
  { name: "云峰剧院", district: "静安", indoor: true },
  { name: "上海商城剧院", district: "静安", indoor: true },
  { name: "静安体育中心", district: "静安", indoor: true },
  { name: "明当代美术馆", district: "静安", indoor: true },
  { name: "上海儿童艺术剧场", district: "黄浦", indoor: true },
  { name: "万代南梦宫上海文化中心", aliases: ["万代南梦宫"], district: "普陀", indoor: true },
  { name: "静安大悦城", district: "静安", indoor: true },
  { name: "四行仓库", aliases: ["上海四行仓库抗战纪念馆"], district: "静安", indoor: true },

  // —— 长宁 ——
  { name: "上海国际舞蹈中心", district: "长宁", indoor: true },
  { name: "刘海粟美术馆", district: "长宁", indoor: true },
  { name: "程十发美术馆", district: "长宁", indoor: true },
  { name: "上海油画雕塑院美术馆", district: "长宁", indoor: true },
  { name: "育音堂", district: "长宁", indoor: true },
  { name: "孙科别墅", district: "长宁", indoor: true },

  // —— 虹口 ——
  { name: "北外滩友邦大剧院", aliases: ["友邦大剧院"], district: "虹口", indoor: true },
  { name: "多伦现代美术馆", district: "虹口", indoor: true },
  { name: "1933老场坊", aliases: ["老场坊"], district: "虹口", indoor: true },
  { name: "上海鲁迅纪念馆", aliases: ["鲁迅纪念馆"], district: "虹口", indoor: true },
  { name: "上海邮政博物馆", district: "虹口", indoor: true },
  { name: "朱屺瞻艺术馆", district: "虹口", indoor: true },
  { name: "SNH48星梦剧院", aliases: ["星梦剧院"], district: "虹口", indoor: true },

  // —— 杨浦 ——
  { name: "复旦大学", district: "杨浦", indoor: true },
  { name: "同济大学", district: "杨浦", indoor: true },
  { name: "上海理工大学", district: "杨浦", indoor: true },
  { name: "上海财经大学", district: "杨浦", indoor: true },
  { name: "YOUNG剧场", district: "杨浦", indoor: true },

  // —— 普陀 ——
  { name: "普陀区文化馆", district: "普陀", indoor: true },
  { name: "环球港", district: "普陀", indoor: true },
  { name: "M50创意园", aliases: ["M50"], district: "普陀", indoor: true },

  // —— 闵行 ——
  { name: "宝龙美术馆", district: "闵行", indoor: true },
  { name: "上海城市剧院", district: "闵行", indoor: true },
  { name: "华东师范大学", aliases: ["华师大"], district: "闵行", indoor: true },
  { name: "上海交通大学", aliases: ["上海交大"], district: "闵行", indoor: true },

  // —— 宝山 ——
  { name: "上海玻璃博物馆", aliases: ["玻璃博物馆"], district: "宝山", indoor: true },
  { name: "上海大学", district: "宝山", indoor: true },

  // —— 嘉定 ——
  { name: "上海保利大剧院", aliases: ["保利大剧院"], district: "嘉定", indoor: true },
  { name: "嘉定博物馆", district: "嘉定", indoor: true },
  { name: "上海汽车博物馆", district: "嘉定", indoor: true },

  // —— 青浦 ——
  { name: "国家会展中心", aliases: ["国家会展中心（上海）", "National Exhibition and Convention Center"], district: "青浦", indoor: true },

  // —— 奉贤 ——
  { name: "金海文化艺术中心", district: "奉贤", indoor: true },
  { name: "上海旅游高等专科学校", district: "奉贤", indoor: true },

  // —— 松江 ——
  { name: "上海欢乐谷", district: "松江", indoor: false },
];

/** 场馆名归一化：全半角、大小写、空格与常见标点都不参与匹配 */
export function normalizeVenueName(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•・\-—–_/\\|:：,，.。!！?？"'“”‘’()（）\[\]【】]/g, "")
    .trim();
}

/** 预计算匹配键，避免每次调用都归一化 100 多条别名 */
const MATCH_INDEX = VENUE_PROFILES.flatMap((profile) =>
  [profile.name, ...(profile.aliases || [])]
    .map((alias) => normalizeVenueName(alias))
    .filter(Boolean)
    .map((key) => ({ key, profile })),
).sort((left, right) => right.key.length - left.key.length);

/**
 * 按场馆名找字典条目。最长别名优先，认不出返回 null（不猜）。
 * @param {string} rawName 场馆名，可以带厅名/楼层/分店后缀
 */
export function matchVenue(rawName) {
  const text = normalizeVenueName(rawName);
  if (!text) return null;
  for (const entry of MATCH_INDEX) {
    if (text.includes(entry.key)) return entry.profile;
  }
  return null;
}

/** 这些场馆名等于「没说」，可以被地址或详情页替换 */
const VAGUE_VENUE_RE = /^(上海|上海市|未知|线上|待定)?$/;

export function isVagueVenue(name) {
  return VAGUE_VENUE_RE.test(String(name || "").trim());
}

/**
 * 第 2 层互补规则：场馆只写「上海」但有地址时，用地址反查字典场馆名；
 * 反查不到就把场馆改成地址（地址本身比「上海」有信息量）。
 * 场馆已经有具体名字时原样返回，不做归一化 —— 「上海文化广场 主剧场」里的厅名是有用信息。
 */
export function resolveVenueName(event) {
  const venue = String(event?.venue || "").trim();
  if (!isVagueVenue(venue)) return venue;

  const address = String(event?.address || "").trim();
  if (!address) return venue;

  const byAddress = matchVenue(address);
  return byAddress ? byAddress.name : address;
}
