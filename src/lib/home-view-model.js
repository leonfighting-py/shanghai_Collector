import { CATEGORIES, COLLECTION_WINDOW_DAYS, toShanghaiDayWindow } from "./events.js";
import { getDisplayTopPicks } from "./recommendations.js";

export const HOME_SECTION_PREVIEW_LIMIT = 4;

export function categoryBrowsePath(category) {
  return `/category/${encodeURIComponent(category)}`;
}

export function buildHomeViewModel(
  events,
  { now = new Date(), featuredLimit = 5, sectionLimit = HOME_SECTION_PREVIEW_LIMIT } = {},
) {
  const window = toShanghaiDayWindow(now);
  return {
    updatedLabel: `${COLLECTION_WINDOW_DAYS}-Day Update`,
    updatedDate: formatShanghaiShortDate(now),
    windowLabel: `${window.startDate} 至 ${window.endDate}`,
    featuredEvents: getDisplayTopPicks(events, featuredLimit, now),
    categorySections: CATEGORIES.map((category) => {
      const inCategory = events.filter((event) => event.category === category);
      const categoryEvents = getDisplayTopPicks(inCategory, inCategory.length, now);

      return {
        title: category,
        eyebrow: CATEGORY_EYEBROWS[category],
        totalCount: categoryEvents.length,
        events: categoryEvents.slice(0, sectionLimit),
        browseHref: categoryBrowsePath(category),
      };
    }).filter((section) => section.totalCount > 0),
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

export function getCategoryEyebrow(category) {
  return CATEGORY_EYEBROWS[category] || "Category";
}
