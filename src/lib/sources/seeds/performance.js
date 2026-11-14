// 演出音乐信源表 —— 从 collector.js 的 SOURCE_SEEDS_RAW 拆出（2026-11-11 WP1）。
// 条目的 order 是它在原数组中的全局位置：合并去重时"先到的当底"（mergeDuplicateEvents），
// 顺序影响采集结果，sources/index.js 会把各文件按 order 排序拼接，保证与拆分前一字不差。
// 新增信源：order 取**全局**最大值 + 1（所有 seeds 文件合起来算，不是本文件的最大值）；
// 撞号会让排序结果依赖文件拼接顺序，test/source-registry.test.js 会拦下重号。
// 条目上方的注释记录了每个源为什么这样配——是仓库最有价值的文档之一，跟着条目走，别删。
import { PARSERS } from "../../parsers/index.js";

export const PERFORMANCE_SEEDS = [
  // 秀动上海：整站 JS 渲染，h5 网络不可达，API 需签名（2026-08 探明），待逆向后恢复：
  // { name: "秀动上海", url: "https://www.showstart.com/event/list?cityCode=310000", category: "演出音乐", locale: "zh", parser: PARSERS.showstart },
  {
    order: 0,
    name: "豆瓣同城上海",
    url: "https://www.douban.com/location/shanghai/events",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.douban,
  },
  {
    order: 1,
    name: "SmartShanghai Events",
    url: "https://www.smartshanghai.com/events/",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.smartshanghai,
  },
  {
    order: 2,
    name: "SmartShanghai Live Music",
    url: "https://www.smartshanghai.com/events/?category=live-music",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.smartshanghai,
  },
  // ⚠️ offshore：境内 runner 打这个站是 403（出口 IP 被拦），只在境外出口的 offshore.yml 里跑，见 docs/offshore-sources.md
  { order: 3, name: "AllEvents Shanghai", url: "https://allevents.in/shanghai", category: "演出音乐", locale: "en", parser: PARSERS.allevents, offshore: true },
  {
    order: 4,
    name: "Eventbrite Shanghai Music",
    url: "https://www.eventbrite.com/d/china--shanghai/music--events/",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  // 西岸艺博会：整站 JS 渲染无 API（2026-08 探明）
  // 本地宝系（活动/周末/市集/音乐演出/演唱会/商场快闪/展览/展会）：拼图验证码反爬，7 源全挂（2026-08 验证）；
  // 公众号类内容改走 wechat-exporter 管线（WECHAT_EVENTS_API_URL）
  {
    order: 23,
    name: "上海文化广场",
    url: "https://www.shcstheatre.com/Program/ProgramList.aspx",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.shcstheatre,
    notes: "音乐剧、话剧、音乐会演出排期",
  },
  {
    order: 24,
    name: "上海音乐学院·海报墙",
    url: "https://www.shcmusic.edu.cn/xhdrl/list.htm",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海音乐学院",
    defaultVenue: "上海音乐学院",
    notes: "上音·海报墙 · 音乐会/演出预告（标题含演出日期）（2026-10 验证）",
  },
  {
    order: 25,
    name: "上海戏剧学院·活动信息",
    url: "https://www.sta.edu.cn/hdxx/list.htm",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海戏剧学院",
    defaultVenue: "上海戏剧学院",
    notes: "上戏·活动信息 · 话剧/展映/大师班（2026-10 验证）",
  },
  {
    order: 26,
    name: "格瓦拉",
    url: "https://www.gewara.com/",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.gewara,
    notes: "电影/演出票务 · 上海站",
  },
  {
    order: 27,
    name: "票牛",
    url: "https://www.piaoniu.com/",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.piaoniu,
    notes: "演唱会/音乐会/话剧/体育赛事票务",
  },

  // ===== 2026-10 第二批扩展：Eventbrite 上海细分类别 =====
  { order: 189, name: "Eventbrite 上海·舞蹈", url: "https://www.eventbrite.com/d/china--shanghai/dance--events/", category: "演出音乐", locale: "en", parser: PARSERS.tentimes },
  { order: 190, name: "Eventbrite 上海·古典音乐", url: "https://www.eventbrite.com/d/china--shanghai/classical--events/", category: "演出音乐", locale: "en", parser: PARSERS.tentimes },
  { order: 191, name: "Eventbrite 上海·爵士", url: "https://www.eventbrite.com/d/china--shanghai/jazz--events/", category: "演出音乐", locale: "en", parser: PARSERS.tentimes },
  { order: 192, name: "Eventbrite 上海·戏剧", url: "https://www.eventbrite.com/d/china--shanghai/theatre--events/", category: "演出音乐", locale: "en", parser: PARSERS.tentimes },

  // ===== 2026-10 扩展：演出音乐 =====
  {
    order: 205,
    name: "上海古典音乐会·上海乐历",
    url: "https://shanghaiconcerts.com/concerts",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.shanghaiConcerts,
    notes: "SSR 演出日历 · 未来 30 天古典音乐/歌剧/音乐剧，含场馆与开演时间（2026-10 新增，含专用解析器）",
  },

  // ===== 2026-10 扩展：豆瓣同城子类目（父源综合榜覆盖不到的漏网条目）=====
  { order: 206, name: "豆瓣同城·上海戏剧", url: "https://www.douban.com/location/shanghai/events/week-drama", category: "演出音乐", locale: "zh", parser: PARSERS.douban },
  { order: 207, name: "豆瓣同城·上海音乐", url: "https://www.douban.com/location/shanghai/events/week-music", category: "演出音乐", locale: "zh", parser: PARSERS.douban },

  // ===== 2026-10-18 第七批扩展：区级文化场馆 / 票务上海站 / 科研院所 / 高校栏目 =====
  // 选源口径（这一批与前几批不同，全部按「境内 runner 可达」过滤过）：
  //   · 只保留**腾讯云 runner 出口 IP 上能 fetch 200 且能解析**的源。境外平台（Eventbrite / Lu.ma /
  //     AllEvents / Meetup）与活动行（含其标签频道）已在停采清单里，本轮不再补同类——本机住宅 IP
  //     能拿到数据，runner 上是 403/405，加了只会让体检报告常年飘红。
  //   · 判据是「本机实测 pub>0」+「结构为主页 SSR 列表」，不是「域名猜对了」。下面每个源的 notes
  //     里记了实测条数与窗口内条数（2026-10-18，窗口 10-18 起 14 天）。
  {
    order: 304,
    name: "票牛上海站",
    url: "https://www.piaoniu.com/shanghai",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.piaoniu,
    notes: "票牛上海频道（不同首页全国榜）· SSR 内嵌项目 JSON，实测 14 条 / 11 条在窗口内，带梅奔、前滩等上海场馆（2026-10-18 新增）",
  },
];
