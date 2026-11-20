// 高校讲座信源 · ecupl（2026-11-20 按学校从 lectures.js 拆出，字段一字未改）
// order 是全局位置，合并去重时「先到的当底」，不要改。新增条目取全局最大 order + 1。
import { PARSERS } from "../../../parsers/index.js";

export const LECTURE_SEEDS_ECUPL = [
  // 上师大·学术园地（xsxx1）：科研成果新闻栏目（论文进展/获奖），非活动预告，故不采集（2026-10 验证）
  {
    order: 59,
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
    order: 152,
    name: "华东政法大学·科研处学术讲坛",
    url: "http://kyc.ecupl.edu.cn/xsjt/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    venueLabel: "华东政法大学",
    defaultVenue: "华东政法大学",
    notes: "区域国别法/刑事审判等法学讲坛（2026-10 验证）",
  },
  {
    order: 264,
    name: "华政·通知公告",
    url: "http://www.ecupl.edu.cn/tzgg/list.htm",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    notes: "第五批扩展·窗口内活跃(召回 1/1)",
  },
];
