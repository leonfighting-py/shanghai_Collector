import { buildEvent } from "./shared.js";

/**
 * Parse 上海群众艺术馆 (Shanghai Mass Art Center) homepage.
 *
 * NOTE: The homepage (www.shqyg.com) is a Vue.js single-page application.
 * All event/activity content (文化活动, 文化赛事, 文化培训, etc.) is loaded
 * dynamically via API calls (e.g. apiActivity/activityList.do).
 *
 * The static HTML contains only Vue templates and JavaScript bootstrap code,
 * with no pre-rendered event data. To extract events, you would need to:
 * - Call the API endpoints directly (e.g. /apiActivity/activityList.do)
 * - Use a headless browser to execute JavaScript and render the page
 *
 * For now, this parser returns an empty array when given static HTML.
 *
 * API endpoint reference (from page source):
 *   - Activities: POST /apiActivity/activityList.do
 *     Returns: [{ activityId, activityName, activityStartTime, activityAddress, activityIconUrl, ... }]
 *   - News: POST /apiInformation/informationList.do
 *     Returns: [{ informationId, informationTitle, pushTime, informationIconUrl, ... }]
 *
 * @param {string} html - The listing page HTML (static, no rendered data)
 * @param {{name: string, url: string, category: string, locale: string}} source - Source metadata
 * @returns {Array} Empty array (data requires JavaScript execution)
 */
export function parseShqyg(html, source) {
  // The homepage is a Vue SPA with no pre-rendered event content.
  // Return empty — the collector should fall back to direct API calls
  // or use a browser-based fetcher for this source.
  return [];
}
