// 采集模拟（不写库）：跑完整 source 列表 + 去重 + 14 天窗口，对比「仅旧源」与「含新源」的产出
import { collectEventsFromSources, SOURCE_SEEDS } from "../src/lib/collector.js";
import { mergeDuplicateEvents, toShanghaiDayWindow } from "../src/lib/events.js";

const mode = process.argv[2] || "all";
const NEW_MARKERS = [
  "上海理工大学·基础学院", "上海理工大学·光电", "上海理工大学·健康", "上海理工大学·出版印刷", "上海理工大学·马克思主义",
  "上海交通大学·机械动力", "上海交通大学·船建", "上海交通大学·电子信息",
  "复旦大学·", "东华大学·", "华东政法大学·科研处", "华东师范大学·心理健康", "华东师范大学·图书馆",
  "上海财经大学·", "上海大学·学术讲座", "上海应用技术大学·", "上海旅游高等专科学校·",
  "上海视觉艺术学院·", "上海震旦职业学院·", "上海建桥学院·", "上海社会科学院·",
  "上海古典音乐会", "豆瓣同城·", "Eventbrite 上海·", "活动行·上海读书会", "活动行·上海机器人",
  "活动行·上海创业投资", "活动行·上海Web3",
];

const all = SOURCE_SEEDS;
const isNew = (source) => NEW_MARKERS.some((marker) => source.name.includes(marker));
const sources = mode === "new" ? all.filter(isNew) : mode === "old" ? all.filter((s) => !isNew(s)) : all;

const { startDate, endDate } = toShanghaiDayWindow(new Date());
const result = await collectEventsFromSources({ sources, previousEvents: [] });
const deduped = mergeDuplicateEvents(result.events);

console.log(JSON.stringify({ mode, sources: sources.length, window: `${startDate}→${endDate}`, collected: result.collectedCount, deduped: deduped.length, failures: result.failures?.length || 0, ok: result.ok }, null, 1));
