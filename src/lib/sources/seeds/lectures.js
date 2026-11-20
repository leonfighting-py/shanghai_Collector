// 高校讲座信源表 —— 从 collector.js 的 SOURCE_SEEDS_RAW 拆出（2026-11-11 WP1）。
// 条目的 order 是它在原数组中的全局位置：合并去重时"先到的当底"（mergeDuplicateEvents），
// 顺序影响采集结果，sources/index.js 会把各文件按 order 排序拼接，保证与拆分前一字不差。
// 新增信源：order 取**全局**最大值 + 1（所有 seeds 文件合起来算，不是本文件的最大值）；
// 撞号会让排序结果依赖文件拼接顺序，test/source-registry.test.js 会拦下重号。
// 条目上方的注释记录了每个源为什么这样配——是仓库最有价值的文档之一，跟着条目走，别删。
import { PARSERS } from "../../parsers/index.js";

import { LECTURE_SEEDS_DHU } from "./lectures/dhu.js";
import { LECTURE_SEEDS_ECNU } from "./lectures/ecnu.js";
import { LECTURE_SEEDS_ECUPL } from "./lectures/ecupl.js";
import { LECTURE_SEEDS_ECUST } from "./lectures/ecust.js";
import { LECTURE_SEEDS_FUDAN } from "./lectures/fudan.js";
import { LECTURE_SEEDS_OTHERS } from "./lectures/others.js";
import { LECTURE_SEEDS_RESEARCH } from "./lectures/research.js";
import { LECTURE_SEEDS_SADA } from "./lectures/sada.js";
import { LECTURE_SEEDS_SHTECH } from "./lectures/shtech.js";
import { LECTURE_SEEDS_SJTU } from "./lectures/sjtu.js";
import { LECTURE_SEEDS_SUFE } from "./lectures/sufe.js";
import { LECTURE_SEEDS_SUIBE } from "./lectures/suibe.js";
import { LECTURE_SEEDS_TONGJI } from "./lectures/tongji.js";
import { LECTURE_SEEDS_USST } from "./lectures/usst.js";
import { LECTURE_SEEDS_VOCATIONAL } from "./lectures/vocational.js";

// 2026-11-20 按学校拆分：单文件 1946 行已经不好维护，新增源要先在 1900 行里找位置。
// 各文件的 order 仍是全局值，index.js 会按 order 重排，拼接顺序不影响行为。
export const LECTURE_SEEDS = [
  ...LECTURE_SEEDS_DHU,
  ...LECTURE_SEEDS_ECNU,
  ...LECTURE_SEEDS_ECUPL,
  ...LECTURE_SEEDS_ECUST,
  ...LECTURE_SEEDS_FUDAN,
  ...LECTURE_SEEDS_OTHERS,
  ...LECTURE_SEEDS_RESEARCH,
  ...LECTURE_SEEDS_SADA,
  ...LECTURE_SEEDS_SHTECH,
  ...LECTURE_SEEDS_SJTU,
  ...LECTURE_SEEDS_SUFE,
  ...LECTURE_SEEDS_SUIBE,
  ...LECTURE_SEEDS_TONGJI,
  ...LECTURE_SEEDS_USST,
  ...LECTURE_SEEDS_VOCATIONAL,
];
