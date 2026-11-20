// 高校讲座信源 · ecust（2026-11-20 按学校从 lectures.js 拆出，字段一字未改）
// order 是全局位置，合并去重时「先到的当底」，不要改。新增条目取全局最大 order + 1。
import { PARSERS } from "../../../parsers/index.js";

export const LECTURE_SEEDS_ECUST = [
  {
    order: 53,
    name: "华东理工大学讲座报告",
    url: "https://news.ecust.edu.cn/jzbg/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.ecustLectures,
    notes: "华东理工·讲座报告栏目 · 单页 24 条覆盖化学/生物/药学/经济多学科 · SSR 列表内含讲座时间/地点",
  },
];
