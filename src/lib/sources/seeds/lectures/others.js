// 高校讲座信源 · others（2026-11-20 按学校从 lectures.js 拆出，字段一字未改）
// order 是全局位置，合并去重时「先到的当底」，不要改。新增条目取全局最大 order + 1。
import { PARSERS } from "../../../parsers/index.js";

export const LECTURE_SEEDS_OTHERS = [
  { order: 43, name: "NYU Shanghai Events", url: "https://events.shanghai.nyu.edu/", category: "高校讲座", locale: "en", parser: PARSERS.nyu },
  // ===== 2026-10 第六批扩展：不限领域 bulk 扩容（西交利物浦/上科大/上音/上戏/电机/海关学院等院系 + 活动行演出类标签 + 会展/图书馆/美术馆/媒体）=====
  {
    order: 78,
    name: "西交利物浦大学·讲座预告",
    url: "http://meeting.xjtu.edu.cn/lecturenotices/list/0/1",
    category: "高校讲座",
    locale: "zh",
    parser: PARSERS.cnCmsLectures,
    notes: "第六批·高校 · 窗口内活跃 12/15（2026-10 验证）",
  },
];
