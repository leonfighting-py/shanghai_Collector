import {
  filterPublishableEvents,
  isInDateRange,
  mergeDuplicateEvents,
  toShanghaiDayWindow,
} from "./events.js";
import { defaultFetchHtml } from "./fetch-html.js";
import { PARSERS } from "./parsers/index.js";
import { isRelevantPerformance } from "./parsers/shared.js";

export { defaultFetchHtml } from "./fetch-html.js";
export { parseJsonLdEvents } from "./parsers/json-ld.js";

export const SOURCE_SEEDS_RAW = [
  // 秀动上海：整站 JS 渲染，h5 网络不可达，API 需签名（2026-08 探明），待逆向后恢复：
  // { name: "秀动上海", url: "https://www.showstart.com/event/list?cityCode=310000", category: "演出音乐", locale: "zh", parser: PARSERS.showstart },
  {
    name: "豆瓣同城上海",
    url: "https://www.douban.com/location/shanghai/events",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.douban,
  },
  {
    name: "SmartShanghai Events",
    url: "https://www.smartshanghai.com/events/",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.smartshanghai,
  },
  {
    name: "SmartShanghai Live Music",
    url: "https://www.smartshanghai.com/events/?category=live-music",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.smartshanghai,
  },
  { name: "AllEvents Shanghai", url: "https://allevents.in/shanghai", category: "演出音乐", locale: "en", parser: PARSERS.allevents },
  {
    name: "Eventbrite Shanghai Music",
    url: "https://www.eventbrite.com/d/china--shanghai/music--events/",
    category: "演出音乐",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  {
    name: "复星艺术中心",
    url: "https://www.fosunfoundation.com/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.fosun,
  },
  {
    name: "上海外滩美术馆",
    url: "https://www.rockbundartmuseum.org/exhibitions/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.rockbund,
  },
  {
    name: "teamLab 无界上海",
    url: "https://art.team-lab.cn/e/borderless-shanghai/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.teamlab,
  },
  // 上海当代艺术博物馆（PSA）：整站 JS 渲染无 API；其展览已被 iMuseum 聚合源覆盖（2026-08 验证）
  {
    name: "中华艺术宫",
    url: "https://www.artmuseumonline.org/art/art/zlgz/zl/dqzl/index.html",
    category: "展览",
    locale: "zh",
    parser: PARSERS.chinaArtMuseum,
  },
  {
    name: "浦东美术馆",
    url: "https://www.museumofartpd.org.cn/exhibition",
    category: "展览",
    locale: "zh",
    parser: PARSERS.map,
  },
  {
    name: "UCCA Edge 上海",
    url: "https://ucca.org.cn/exhibitions/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.ucca,
  },
  {
    name: "Fotografiska 上海",
    url: "https://shanghai.fotografiska.com/en/whats-on",
    category: "展览",
    locale: "zh",
    parser: PARSERS.fotografiska,
  },
  {
    name: "iMuseum 上海展览",
    url: "https://art.icity.ly/shanghai",
    category: "展览",
    locale: "zh",
    parser: PARSERS.imuseum,
    notes: "每日环球展览 iMuseum · 聚合上海各场馆展览信息",
  },
  {
    name: "上海民生现代美术馆",
    url: "http://www.minshengart.com/cn/index/exhibitions-and-events/exhibition",
    category: "展览",
    locale: "zh",
    parser: PARSERS.minsheng,
    notes: "民生现代美术馆 · 当代艺术展览",
  },
  {
    name: "宝龙美术馆·正在热展",
    url: "https://www.powerlongmuseum.com/exhibition_now.html",
    category: "展览",
    locale: "zh",
    parser: PARSERS.powerlong,
    notes: "宝龙美术馆·正在热展 · 列表含展期与展厅（2026-10 验证）",
  },
  {
    name: "宝龙美术馆·即将到来",
    url: "https://www.powerlongmuseum.com/exhibition_future.html",
    category: "展览",
    locale: "zh",
    parser: PARSERS.powerlong,
    notes: "宝龙美术馆·即将到来 · 新展预告（2026-10 验证）",
  },
  {
    name: "意大利文化处·活动日历",
    url: "https://iicshanghai.esteri.it/zh/gli_eventi/calendario/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.iicShanghai,
    notes: "意大利驻沪总领馆文化处 · 意方相关展览/文化活动（多在上海各美术馆）（2026-10 验证）",
  },
  {
    name: "龙美术馆",
    url: "http://www.thelongmuseum.org/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.longMuseum,
    notes: "龙美术馆西岸馆 · 当代艺术展览",
  },
  {
    name: "余德耀美术馆",
    url: "http://www.yuzmshanghai.org/exhibitions/current/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.yuzMuseum,
    notes: "余德耀美术馆 · 当代艺术展览",
  },
  {
    name: "震旦博物馆",
    url: "https://www.auroramuseum.cn/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.auroraMuseum,
    notes: "震旦博物馆 · 古代文物与当代艺术",
  },
  {
    name: "上海博物馆",
    url: "https://www.shanghaimuseum.net/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.shanghaiMuseum,
    notes: "上海博物馆 · 文物考古与艺术展览",
  },
  {
    name: "西岸美术馆",
    url: "http://wbmshanghai.com/zh-hans/exhibition/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.westbundMuseum,
    notes: "西岸美术馆 · 蓬皮杜中心合作项目",
  },
  {
    name: "苏州博物馆",
    url: "https://www.szmuseum.com/",
    category: "展览",
    locale: "zh",
    parser: PARSERS.szmuseum,
    notes: "苏州博物馆 · 长三角周边展览",
  },
  // 西岸艺博会：整站 JS 渲染无 API（2026-08 探明）
  // 本地宝系（活动/周末/市集/音乐演出/演唱会/商场快闪/展览/展会）：拼图验证码反爬，7 源全挂（2026-08 验证）；
  // 公众号类内容改走 wechat-exporter 管线（WECHAT_EVENTS_API_URL）
  {
    name: "上海文化广场",
    url: "https://www.shcstheatre.com/Program/ProgramList.aspx",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.shcstheatre,
    notes: "音乐剧、话剧、音乐会演出排期",
  },
  {
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
    name: "格瓦拉",
    url: "https://www.gewara.com/",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.gewara,
    notes: "电影/演出票务 · 上海站",
  },
  {
    name: "票牛",
    url: "https://www.piaoniu.com/",
    category: "演出音乐",
    locale: "zh",
    parser: PARSERS.piaoniu,
    notes: "演唱会/音乐会/话剧/体育赛事票务",
  },
  // 上海话剧艺术中心：API 仅剧目库无档期、页面无演出数据；售票信息已被格瓦拉覆盖（2026-08 验证）
  // 中国上海国际艺术节：整站 JS 渲染；参演剧目已被格瓦拉覆盖（2026-08 验证，样本含2条艺术节剧目）
  {
    name: "赢商网",
    url: "http://www.winshang.com/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.winshang,
    notes: "商业地产门户 · 新店开业/品牌首店资讯",
  },
  {
    name: "赢商网·华东",
    url: "http://sh.winshang.com/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.winshangShanghai,
    notes: "华东商业地产 · 上海项目招商/品牌入驻",
  },
  {
    name: "Timeout上海",
    url: "https://www.timeoutshanghai.com/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.timeoutShanghai,
    notes: "上海英文生活方式指南 · 活动/餐饮/艺术",
  },
  {
    name: "上海热线",
    url: "https://www.online.sh.cn/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.shanghaiOnline,
    notes: "上海本地门户 · 各类活动资讯",
  },
  // 上海群艺馆：整站 JS 渲染无 API（2026-08 探明）
  {
    name: "上海文旅局·艺术活动",
    url: "https://whlyj.sh.gov.cn/yshd/",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.whlyj,
    notes: "上海市文旅局 · 月度美术馆观展指南/文化活动",
  },
  // 上海自然博物馆：整站 JS 渲染无 API（2026-08 探明）
  // 大麦上海：HTTP 500 反爬（2026-08 探明）；票务信息由格瓦拉/票牛覆盖
  {
    name: "活动行上海",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7&orderby=hot",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "eventlist 端点为 SSR 渲染，events 页为 JS 渲染",
  },
  {
    name: "活动行·上海推荐",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "活动行上海默认推荐流（非热门排序）· 各行业活动（2026-10 验证）",
  },
  {
    name: "上海图书馆·活动预约",
    url: "https://www.library.sh.cn/activity",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.shlibActivity,
    notes: "上海图书馆·活动预约（全部分类）· 讲座/展览/培训（2026-10 验证）",
  },
  {
    name: "上海图书馆·讲座",
    url: "https://www.library.sh.cn/activity?tabName=%E8%AE%B2%E5%BA%A7",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.shlibActivity,
    notes: "上海图书馆·讲座 tab · 上图讲座系列（2026-10 验证）",
  },
  {
    name: "嘉定区图书馆·嘉图讲座",
    url: "http://wenlv.jiading.cn/jdlib/hd/jtjz",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.jiadingLibrary,
    notes: "嘉定区图书馆·嘉图讲座栏目 · 详情页补活动时间/地点（2026-10 验证）",
  },
  {
    name: "互动吧上海",
    url: "https://www.huodong.com/event?cityCode=310000",
    category: "线下活动",
    locale: "zh",
    parser: PARSERS.huodongBa,
  },
  {
    name: "Eventbrite Shanghai",
    url: "https://www.eventbrite.com/d/china--shanghai/events/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  {
    name: "Eventbrite Shanghai Business",
    url: "https://www.eventbrite.com/d/china--shanghai/business--events/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  {
    name: "Eventbrite Shanghai Networking",
    url: "https://www.eventbrite.com/d/china--shanghai/networking--events/",
    category: "线下活动",
    locale: "en",
    parser: PARSERS.tentimes,
  },
  { name: "Lu.ma Shanghai", url: "https://lu.ma/shanghai", category: "线下活动", locale: "en", parser: PARSERS.luma },
  { name: "NYU Shanghai Events", url: "https://events.shanghai.nyu.edu/", category: "高校讲座", locale: "en", parser: PARSERS.nyu },
  { name: "上外活动平台", url: "https://event.shisu.edu.cn/", category: "高校讲座", locale: "zh", parser: PARSERS.shisu },
  { name: "上海交通大学活动", url: "https://gc.sjtu.edu.cn/cn/event/", category: "高校讲座", locale: "zh", parser: PARSERS.sjtu },
  {
    name: "同济大学活动",
    url: "https://see.tongji.edu.cn/index/jqzyhd.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.tongjiSee,
  },
  {
    name: "上海财经大学",
    url: "https://www.sufe.edu.cn/",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.sufe,
    notes: "上海财经大学 · 学术讲座与校园活动",
  },
  {
    name: "华东师范大学主页讲座",
    url: "https://eoffice.ecnu.edu.cn/sublectures/main.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.ecnuLectures,
    notes: "华师大院系学术讲座荟萃 · SSR 列表 + 详情页结构化抓取",
  },
  {
    name: "复旦大学化学系讲座",
    url: "https://chemistry.fudan.edu.cn/46012/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.fudanChemistry,
    notes: "复旦化学系 · SSR 列表内含主讲/时间/地点",
  },
  {
    name: "上海交通大学学术讲座",
    url: "https://news.sjtu.edu.cn/xsjz/index.html",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.sjtuNewsLectures,
    notes: "上交新闻中心·学术讲座栏目 · SSR 列表内含时间/地点/主讲",
  },
  {
    name: "上海电力大学学术活动",
    url: "https://www.shiep.edu.cn/academics/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.shiepLectures,
    notes: "上海电力大学 · SSR 列表内含时间/地点/主讲/主办",
  },
  {
    name: "上海科技大学讲座报告",
    url: "https://www.shanghaitech.edu.cn/p15080c14750/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.shanghaitechLectures,
    notes: "上科大讲座报告 · SSR 列表 + 详情页取开始时间/报告地点",
  },
  {
    name: "华东理工大学讲座报告",
    url: "https://news.ecust.edu.cn/jzbg/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.ecustLectures,
    notes: "华东理工·讲座报告栏目 · 单页 24 条覆盖化学/生物/药学/经济多学科 · SSR 列表内含讲座时间/地点",
  },
  {
    name: "复旦大学上海医学院讲座",
    url: "https://gs-shmc.fudan.edu.cn/sywtz/list1.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.fudanShmcLectures,
    notes: "复旦上海医学院·最新动态中标识为［讲座信息］的条目 · 详情页为海报图故以发布日作为开始时间兜底",
  },
  {
    name: "复旦大学药学院讲座",
    url: "https://spfdu.fudan.edu.cn/28477/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.fudanSpfduLectures,
    notes: "复旦药学院·通知公告 · 按标题关键词（讲座/讲坛/论坛）过滤，标题内含日期则优先解析",
  },
  {
    name: "上海创智学院·创智日历",
    url: "https://www.sii.edu.cn/czrl/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.siiCalendar,
    notes: "AI 前沿学术报告/创智沙龙 · SSR 列表内含讲座时间与地点（2026-10 验证）",
  },
  // ===== 高校门户讲座栏目（同一套 CMS 模板，解析器见 cn-cms-lectures.js）=====
  {
    name: "上海师范大学·学术讲座",
    url: "https://www.shnu.edu.cn/xsxx/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海师范大学",
    defaultVenue: "上海师范大学",
    notes: "上师大·学术讲座栏目 · 列表日期为发布日，详情页补时间/地点（2026-10 验证）",
  },
  {
    name: "上海师范大学·活动演出",
    url: "https://www.shnu.edu.cn/hdyc/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海师范大学",
    defaultVenue: "上海师范大学",
    notes: "上师大·活动演出栏目 · 典礼/演出/校园活动（2026-10 验证）",
  },
  // 上师大·学术园地（xsxx1）：科研成果新闻栏目（论文进展/获奖），非活动预告，故不采集（2026-10 验证）
  {
    name: "华东政法大学·讲座",
    url: "https://www.ecupl.edu.cn/jz/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "华东政法大学",
    defaultVenue: "华东政法大学",
    notes: "华政·讲座栏目 · 详情页含「时 间/地 点」字段（2026-10 验证）",
  },
  {
    name: "上海理工大学·讲座日志",
    url: "https://www.usst.edu.cn/jzrz2_1045/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海理工大学",
    defaultVenue: "上海理工大学",
    notes: "上理工·讲座日志 · 列表内联时间与地点，无需抓详情（2026-10 验证）",
  },
  {
    name: "上海理工大学·学术报告",
    url: "https://www.usst.edu.cn/xsbg_1583/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海理工大学",
    defaultVenue: "上海理工大学",
    notes: "上理工·学术报告栏目 · 列表内联时间与地点（2026-10 验证，栏目更新较慢）",
  },
  {
    name: "上海理工大学·文化活动",
    url: "https://www.usst.edu.cn/whhd_1584/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海理工大学",
    defaultVenue: "上海理工大学",
    notes: "上理工·文化活动栏目 · 讲坛/大师课等（2026-10 验证，栏目更新较慢）",
  },
  {
    name: "上海海事大学·讲座信息",
    url: "https://www.shmtu.edu.cn/xsjz/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海海事大学",
    defaultVenue: "上海海事大学",
    notes: "海事·讲座信息栏目 · 含 AI/深度学习等前沿讲座（2026-10 验证）",
  },
  {
    name: "上海海事大学·学生活动",
    url: "https://www.shmtu.edu.cn/12204/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海海事大学",
    defaultVenue: "上海海事大学",
    notes: "海事·学生活动栏目 · 校园培训/实践动态（2026-10 验证）",
  },
  {
    name: "上海政法学院·学术星空",
    url: "https://www.shupl.edu.cn/xsxk/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海政法学院",
    defaultVenue: "上海政法学院",
    notes: "上政·学术星空栏目 · 讲坛/工作坊（2026-10 验证）",
  },
  {
    name: "上海健康医学院·讲座报告",
    url: "https://www.sumhs.edu.cn/jzbg_1326/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海健康医学院",
    defaultVenue: "上海健康医学院",
    notes: "上健医·讲座报告栏目 · 学术沙龙系列（2026-10 验证）",
  },
  {
    name: "上海海洋大学·学术讲座",
    url: "https://www.shou.edu.cn/xsjz/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海海洋大学",
    defaultVenue: "上海海洋大学",
    notes: "上海海洋·学术讲座栏目 · 详情页补时间（2026-10 验证，栏目更新较慢）",
  },
  {
    // 通用 LLM 抽取源试点：自建站 /events 页有 Cloudflare 403，首页 SSR 可用
    name: "AI Tinkerers Shanghai",
    url: "https://shanghai.aitinkerers.org/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.llmExtract,
    notes: "通用 LLM 抽取（需 LLM_EXTRACT_ENABLED）· 官网 shanghai.aitinkerers.org",
  },
  {
    name: "ShanghAI AI Meetup",
    url: "https://www.meetup.com/shanghai-ai/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.meetup,
  },
  // OpenClaw Shanghai：与 Lu.ma Shanghai 同 URL（lu.ma/shanghai）重复，已删（2026-08 验证）
  {
    name: "Eventbrite Shanghai AI",
    url: "https://www.eventbrite.com/d/china--shanghai/artificial-intelligence--events/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.eventbriteAiTech,
  },
  {
    name: "Eventbrite Shanghai Tech",
    url: "https://www.eventbrite.com/d/china--shanghai/science-and-tech--events/",
    category: "AI聚会",
    locale: "en",
    parser: PARSERS.eventbriteAiTech,
  },
  {
    name: "活动行·上海AI",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7&tag=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD",
    category: "AI聚会",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "活动行「人工智能」标签 · GAIC/PyCon/A2M 等上海 AI 大会与路演",
  },
  {
    name: "活动行·上海AI关键词",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7&tag=AI",
    category: "AI聚会",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "活动行「AI」标签 · AI Engineer/具身智能/开发者大会（2026-10 验证）",
  },
  {
    name: "活动行·上海大模型",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7&tag=%E5%A4%A7%E6%A8%A1%E5%9E%8B",
    category: "AI聚会",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "活动行「大模型」标签 · 模型/Agent 开发者线下活动（2026-10 验证）",
  },
  {
    name: "活动行·上海AIGC",
    url: "https://www.huodongxing.com/eventlist?city=%E4%B8%8A%E6%B5%B7&tag=AIGC",
    category: "AI聚会",
    locale: "zh",
    parser: PARSERS.huodong,
    notes: "活动行「AIGC」标签 · AIGC 应用/训练营类活动（2026-10 验证）",
  },
  {
    name: "GDG 上海",
    url: "https://gdg.community.dev/gdg-shanghai/",
    category: "AI聚会",
    locale: "zh",
    parser: PARSERS.gdgShanghai,
    notes: "Google 开发者社区上海 · Build with AI/DevFest/Gemma 大赛等（2026-10 验证）",
  },
  {
    name: "上海人工智能实验室·科研活动",
    url: "https://www.shlab.org.cn/event",
    category: "AI聚会",
    locale: "zh",
    parser: PARSERS.shlab,
    notes: "上海AI实验室活动预告/论坛/交流会 · 列表标题 + 详情页限量取日期（2026-10 验证）",
  },
  ...(process.env.WECHAT_EVENTS_API_URL || process.env.WECHAT_EXPORTER_AUTH_KEY
    ? [
        {
          name: "微信公众号活动",
          url: process.env.WECHAT_EVENTS_API_URL || process.env.WECHAT_EXPORTER_BASE_URL || "http://localhost:3001",
          category: process.env.WECHAT_DEFAULT_CATEGORY || "线下活动",
          locale: "zh",
          parser: PARSERS.wechat,
          timeoutMs: 180_000,
        },
      ]
    : []),
];

const T1_VENUE_NAMES = new Set([
  "teamLab 无界上海",
  "UCCA Edge 上海",
  "Fotografiska 上海",
  "AI Tinkerers Shanghai",
]);
const T1_NAME_PATTERNS = [/美术馆|博物馆|艺术宫|艺术中心|剧院|文化广场/];
const T2_NAME_PATTERNS = [/豆瓣|SmartShanghai|AllEvents|Eventbrite|iMuseum|赢商网|Timeout|上海热线|活动行|互动吧|Lu\.?ma|格瓦拉|票牛|Meetup/i];

export function resolveSourceTier(source) {
  if (source?.tier) return source.tier;
  const name = source?.name || "";
  const url = source?.url || "";
  if (/\.edu\.cn(\/|$)/i.test(url) || /nyu\.edu/i.test(url)) return "T1";
  if (/\.gov\.cn(\/|$)/i.test(url)) return "T1";
  if (T1_VENUE_NAMES.has(name)) return "T1";
  if (T1_NAME_PATTERNS.some((re) => re.test(name))) return "T1";
  if (T2_NAME_PATTERNS.some((re) => re.test(name))) return "T2";
  return "T2";
}

export const SOURCE_SEEDS = SOURCE_SEEDS_RAW.map((source) => ({
  ...source,
  tier: resolveSourceTier(source),
}));

// 失败原因分类：把原始错误字符串归入固定桶，供健康报告做可靠的趋势统计
// （替代之前 health-check 里 String(msg).split(':')[0] 的脆弱字符串前缀匹配）。
export function classifyFailure(message) {
  const text = String(message || "");
  if (/timed?\s*out|超时|after \d+s/i.test(text)) return "timeout";
  if (/429/.test(text)) return "rate_limited";
  if (/HTTP\s*4\d\d|HTTP 4\d\d/.test(text)) return "http_4xx";
  if (/HTTP\s*5\d\d|HTTP 5\d\d/.test(text)) return "http_5xx";
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|getaddrinfo|TypeError|cert|ssl/i.test(text)) return "network";
  if (/parse|解析|JSON|无法|expected|unexpected token/i.test(text)) return "parse";
  return "unknown";
}

async function withSourceTimeout(task, sourceName, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${sourceName} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// 有界并发度：与 source-health-check.js 的 CONCURRENCY 对齐。
// 这些源都是不同网站，并发 5 不会触发反爬；慢源/超时不再拖垮整批采集时长。
const DEFAULT_CONCURRENCY = Number(process.env.COLLECTOR_CONCURRENCY) || 5;

export async function collectEventsFromSources({
  sources = SOURCE_SEEDS,
  previousEvents = [],
  fetchHtml = defaultFetchHtml,
  now = new Date(),
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  const { startDate, endDate, days } = toShanghaiDayWindow(now);
  const failures = [];
  const collected = [];

  const collectOne = async (source) => {
    try {
      const parsed = await withSourceTimeout(
        async () => {
          const html = await fetchHtml(source.url);
          return source.parser(html, source, { fetchHtml, now, window: { startDate, endDate, days } });
        },
        source.name,
        source.timeoutMs || 45_000,
      );
      return { events: parsed, failure: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        events: [],
        failure: {
          source: source.name,
          url: source.url,
          message,
          kind: classifyFailure(message),
        },
      };
    }
  };

  const limit = Math.max(1, concurrency);
  for (let index = 0; index < sources.length; index += limit) {
    const chunk = sources.slice(index, index + limit);
    const outcomes = await Promise.all(chunk.map(collectOne));
    for (const outcome of outcomes) {
      if (outcome.failure) failures.push(outcome.failure);
      else collected.push(...outcome.events);
    }
  }

  const events = mergeDuplicateEvents(
    filterPublishableEvents(collected)
      .filter((event) => isInDateRange(event, startDate, endDate))
      .filter((event) => event.category !== "演出音乐" || isRelevantPerformance(event)),
  );

  if (events.length === 0 && previousEvents.length > 0) {
    return {
      ok: false,
      events: previousEvents,
      failures,
      collectedCount: 0,
      publishedCount: previousEvents.length,
      startDate,
      endDate,
      windowDays: days,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    ok: failures.length === 0,
    events,
    failures,
    rawEvents: collected,
    collectedCount: collected.length,
    publishedCount: events.length,
    startDate,
    endDate,
    windowDays: days,
    lastUpdatedAt: new Date().toISOString(),
  };
}
