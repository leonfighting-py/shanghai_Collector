import { CATEGORIES } from "./events.js";
import { getTopPicks } from "./recommendations.js";

export function buildHomeViewModel(events, { now = new Date(), featuredLimit = 5, sectionLimit = 4 } = {}) {
  return {
    updatedLabel: "Daily Update",
    updatedDate: formatShanghaiShortDate(now),
    featuredEvents: getTopPicks(events, featuredLimit, now),
    categorySections: CATEGORIES.map((category) => ({
      title: category,
      eyebrow: CATEGORY_EYEBROWS[category],
      events: getTopPicks(
        events.filter((event) => event.category === category),
        sectionLimit,
        now,
      ),
    })).filter((section) => section.events.length > 0),
  };
}

export function formatShanghaiShortDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${month}/${day}`;
}

const CATEGORY_EYEBROWS = {
  演出音乐: "Live Music & Shows",
  展览: "Exhibitions",
  线下活动: "City Happenings",
  高校讲座: "Campus Talks",
  AI聚会: "AI Meetups",
};
