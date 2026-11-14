// 信源注册表汇总 —— 2026-11-11 WP1 从 collector.js 拆出。
// 停采、新增、打标记都改 seeds/ 下的数据文件；本文件只负责汇总和派生集合，
// 采集调度逻辑仍在 collector.js。
import { AI_MEETUP_SEEDS } from "./seeds/ai-meetup.js";
import { EXHIBITION_SEEDS } from "./seeds/exhibition.js";
import { LECTURE_SEEDS } from "./seeds/lectures.js";
import { OFFLINE_SEEDS } from "./seeds/offline.js";
import { PERFORMANCE_SEEDS } from "./seeds/performance.js";
import { wechatDynamicSources, xTimelineDynamicSources } from "./seeds/dynamic.js";
import { RETIRED_SOURCE_NAMES } from "./retired.js";
import { resolveSourceTier } from "./tier.js";

// ⚠️ 合并顺序必须与拆分前一字不差：mergeDuplicateEvents 同键合并时"先到的当底"，
// 改了顺序采集结果就可能变。原始数组里类目高度交错（44 段），不能简单按文件拼接——
// 所以每个静态条目带 order（原数组下标），这里排序还原；动态条目（公众号 / X 时间线）
// 在原数组里就排在末尾，保持追加在最后。
const staticSeeds = [
  ...PERFORMANCE_SEEDS,
  ...EXHIBITION_SEEDS,
  ...OFFLINE_SEEDS,
  ...LECTURE_SEEDS,
  ...AI_MEETUP_SEEDS,
].sort((a, b) => a.order - b.order);

// 静态条目原样导出，供 test/source-registry.test.js 检查 order 不重号
export const STATIC_SEEDS_WITH_ORDER = staticSeeds;

// order 只用来还原顺序，排完就去掉：下游（解析器、source_configs、告警）拿到的对象与拆分前一字不差
export const SOURCE_SEEDS_RAW = [
  ...staticSeeds.map(({ order, ...source }) => source),
  ...wechatDynamicSources(),
  ...xTimelineDynamicSources(),
];

// 停采过滤：名字进 RETIRED_SOURCE_NAMES 即停采（可逆配置，URL 与 parser 原样留着）
export const SOURCE_SEEDS = SOURCE_SEEDS_RAW
  .filter((source) => !RETIRED_SOURCE_NAMES.has(source.name))
  .map((source) => ({
    ...source,
    tier: resolveSourceTier(source),
  }));

// 出口 IP 被反爬的源（Eventbrite / 活动行 / AllEvents …）单独归组：
// 境内 runner 打这些站是 403/405，只能由境外出口的 offshore.yml 采集，
// 结果以 artifact 形式交给主采集合并（见 docs/offshore-sources.md）。
export const OFFSHORE_SOURCES = SOURCE_SEEDS.filter((source) => source.offshore);

// 境内 runner 要跑的源：排除 offshore，否则每轮都会白跑一遍并记一堆 403
export const LAND_SOURCES = SOURCE_SEEDS.filter((source) => !source.offshore);
