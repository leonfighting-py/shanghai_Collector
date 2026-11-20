// 高校讲座信源 · sjtu（2026-11-20 按学校从 lectures.js 拆出，字段一字未改）
// order 是全局位置，合并去重时「先到的当底」，不要改。新增条目取全局最大 order + 1。
import { PARSERS } from "../../../parsers/index.js";

export const LECTURE_SEEDS_SJTU = [
  { order: 45, name: "上海交通大学活动", url: "https://gc.sjtu.edu.cn/cn/event/", category: "高校讲座", locale: "zh", parser: PARSERS.sjtu },
  {
    order: 50,
    name: "上海交通大学学术讲座",
    url: "https://news.sjtu.edu.cn/xsjz/index.html",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.sjtuNewsLectures,
    notes: "上交新闻中心·学术讲座栏目 · SSR 列表内含时间/地点/主讲",
  },
  {
    order: 121,
    name: "上海交通大学研究生院·招生活动",
    url: "https://yzb.sjtu.edu.cn/",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    notes: "第六批·高校 · 已验证栏目 2 条，近期无更新（2026-10 验证）",
  },
  {
    order: 143,
    name: "上海交通大学·机械动力工程学院学术报告",
    url: "https://me.sjtu.edu.cn/xsbg/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海交通大学机械与动力工程学院",
    defaultVenue: "上海交通大学机械与动力工程学院",
    notes: "上交机动学院·学术报告 · 列表内联日期（2026-10 验证）",
  },
  {
    order: 161,
    name: "上海交通大学·船建学院学术活动",
    url: "https://naoce.sjtu.edu.cn/xshd/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海交通大学船舶海洋与建筑工程学院",
    defaultVenue: "上海交通大学船舶海洋与建筑工程学院",
    notes: "土木/船舶/力学方向报告（2026-10 验证）",
  },
  {
    order: 162,
    name: "上海交通大学·电子信息与电气工程学院学术报告",
    url: "https://www.seiee.sjtu.edu.cn/xsbg/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海交通大学电子信息与电气工程学院",
    defaultVenue: "上海交通大学电子信息与电气工程学院",
    notes: "电气/自动化/计算机方向（2026-10 验证）",
  },
];
