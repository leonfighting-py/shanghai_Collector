const format = require("./format.js");

const AI_LECTURE_KEYWORDS =
  /AI|人工智能|大模型|机器学习|深度学习|LLM|GPT|大语言模型|生成式|神经网络|Tensor|数据挖掘/i;

function byStartTimeAsc(left, right) {
  return new Date(left.start_time).getTime() - new Date(right.start_time).getTime();
}

// 高校讲座：AI 相关优先置顶，其余未发生的按时间升序、已发生的排后
// （与 Web 端 src/lib/recommendations.js 的 sortCampusLectures 规则一致）
function sortCampusLectures(events, now = new Date()) {
  const today = format.toShanghaiDate(now);
  const upcoming = [];
  const past = [];
  for (const event of events) {
    if (format.toShanghaiDate(event.start_time) >= today) upcoming.push(event);
    else past.push(event);
  }
  upcoming.sort(byStartTimeAsc);
  past.sort((left, right) => new Date(right.start_time).getTime() - new Date(left.start_time).getTime());

  const timeSorted = [...upcoming, ...past];
  const isAiLecture = (event) =>
    AI_LECTURE_KEYWORDS.test(event.title || "") || AI_LECTURE_KEYWORDS.test(event.summary || "");
  return [...timeSorted.filter(isAiLecture), ...timeSorted.filter((event) => !isAiLecture(event))];
}

// 展览：有封面图的优先展示，其余按开始时间
function sortExhibitions(events) {
  return [...events].sort((left, right) => {
    const leftImage = left.image_url ? 1 : 0;
    const rightImage = right.image_url ? 1 : 0;
    return rightImage - leftImage || byStartTimeAsc(left, right);
  });
}

function sortForCategory(events, category) {
  if (category === "高校讲座") return sortCampusLectures(events);
  if (category === "展览") return sortExhibitions(events);
  return [...events].sort(byStartTimeAsc);
}

module.exports = { sortForCategory };
