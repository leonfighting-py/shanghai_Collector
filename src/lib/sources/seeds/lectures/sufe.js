// 高校讲座信源 · sufe（2026-11-20 按学校从 lectures.js 拆出，字段一字未改）
// order 是全局位置，合并去重时「先到的当底」，不要改。新增条目取全局最大 order + 1。
import { PARSERS } from "../../../parsers/index.js";

export const LECTURE_SEEDS_SUFE = [
  {
    order: 47,
    name: "上海财经大学",
    url: "https://www.sufe.edu.cn/",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.sufe,
    notes: "上海财经大学 · 学术讲座与校园活动",
  },
  {
    order: 159,
    name: "上海财经大学·经济学院学术讲座",
    url: "https://econ.sufe.edu.cn/xsjz1/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海财经大学经济学院",
    defaultVenue: "上海财经大学经济学院",
    notes: "计量/行为实验/宏观系列，标题含期号与主讲人，详情页补时间地点（2026-10 验证）",
  },
  {
    order: 160,
    name: "上海财经大学·育衡讲坛",
    url: "https://archives.sufe.edu.cn/yhjt/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "上海财经大学",
    defaultVenue: "上海财经大学",
    notes: "校史馆/博物馆系列公开讲坛（2026-10 验证）",
  },
  {
    order: 268,
    name: "上财校史馆·会议论坛",
    url: "https://archives.sufe.edu.cn/hylt/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    notes: "第五批扩展·已验证栏目(近 20 条，近期无更新)",
  },
  {
    order: 284,
    name: "上财科研处·学者论坛",
    url: "https://ky.sufe.edu.cn/scwxzwxwwxpwlt/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    notes: "第五批扩展·已验证栏目(近 8 条，近期无更新)",
  },
  {
    order: 286,
    name: "上财教务处·通知公告",
    url: "https://jiaoxue.sufe.edu.cn/index/tzgg.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    notes: "第五批扩展·已验证栏目(近 7 条，近期无更新)",
  },
];
