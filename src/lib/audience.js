// 人群标签：只用四个固定值，空数组表示没有明确指向。
//
// 这些规则是**推导**，不是描述：一条活动标「学生」只因为它是高校讲座，不代表只对学生开放。
// 所以标签只做筛选辅助，界面上不写成「仅限」。

export const AUDIENCE_LABELS = ["亲子", "学生", "行业人士", "英语友好"];

// 「亲子」看标题与摘要。含「适合 3-12 岁」「儿童剧」「少儿」这类明确指向的才算。
// 只写「儿童」太宽（「儿童艺术剧场」是场馆名，不是这场活动面向儿童），所以不单独收。
const KIDS_PATTERN = /亲子|儿童剧|少儿|亲子剧|绘本剧|适合\s*\d+\s*[-～~到至]\s*\d+\s*岁|\d+\s*[-～~到至]\s*\d+\s*岁的?(孩子|小朋友)|家庭日/;

// 行业类信源：展会主办方、技术社区、科技媒体
const INDUSTRY_SOURCE_PATTERN = /新国际博览中心|国家会展中心|GDG|SegmentFault|钛媒体|InfoQ|极客公园/;

// 英文信源：只放确认过是英文站的，别把聚合器（Eventbrite / AllEvents）一锅端——
// 上面同时有中文活动，标错了会让「英语友好」失去意义。
const ENGLISH_SOURCE_PATTERN = /SmartShanghai/i;

const CJK_PATTERN = /[\u4e00-\u9fa5]/;

/**
 * 按规则推导人群标签（第 2 层）。返回数组，顺序固定，便于比较与展示。
 * @param {{category?:string, title?:string, summary?:string, source_name?:string}} event
 */
export function deriveAudience(event = {}) {
  const labels = new Set();
  const title = String(event.title || "");
  const summary = String(event.summary || "");
  const sourceName = String(event.source_name || "");

  if (KIDS_PATTERN.test(`${title} ${summary}`)) labels.add("亲子");
  if (event.category === "高校讲座") labels.add("学生");
  if (INDUSTRY_SOURCE_PATTERN.test(sourceName)) labels.add("行业人士");
  // 纯英文标题（一个汉字都没有）说明这场活动用英语进行；中文标题不提，避免误标
  if (title && !CJK_PATTERN.test(title)) labels.add("英语友好");
  if (ENGLISH_SOURCE_PATTERN.test(sourceName)) labels.add("英语友好");

  return AUDIENCE_LABELS.filter((label) => labels.has(label));
}
