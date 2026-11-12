import { COLLECTION_WINDOW_DAYS, toShanghaiDate, toShanghaiDayWindow } from "./events.js";
import { formatDotDate, pickHighlights, splitByToday } from "./agenda.js";
import { getDisplayTopPicks } from "./recommendations.js";

/**
 * 首页服务端视图模型：只算首屏下方那条「本期」信息和「本期推荐」。
 * 日程表本身（按天分桶、类目/搜索筛选）在客户端由 src/lib/agenda.js 现算，
 * 因为切类目要求零延迟，不能每次回服务端。
 */
export function buildHomeViewModel(events, { now = new Date(), highlightLimit = 3 } = {}) {
  const window = toShanghaiDayWindow(now);
  const today = toShanghaiDate(now);
  const { ongoing, upcoming } = splitByToday(events, today);

  return {
    today,
    windowDays: COLLECTION_WINDOW_DAYS,
    issueLabel: `${window.startDate.slice(0, 4)} · ${formatDotDate(window.startDate)} — ${formatDotDate(window.endDate)}`,
    stats: {
      upcoming: upcoming.length,
      ongoing: ongoing.length,
      venues: new Set(events.map((event) => event.venue)).size,
    },
    highlights: pickHighlights(getDisplayTopPicks(upcoming, upcoming.length, now), {
      today,
      limit: highlightLimit,
    }),
  };
}
