/**
 * 上海自然博物馆 (Shanghai Natural History Museum)
 * URL: https://www.snhm.org.cn/
 *
 * NOTE: The homepage HTML contains primarily static UI elements
 * (banner slideshow, navigation, facility info). There are no
 * structured event/exhibition listings on the homepage.
 *
 * Event and exhibition content lives on subpages:
 *   - /lzdy/lzIndex.htm (临展电影 - temporary exhibitions)
 *   - /jyhd/index.htm (教育活动 - educational activities)
 *
 * These subpages would need to be fetched separately to extract
 * event data. The homepage alone does not contain parseable events.
 */
export function parseSnhmEvents(_html, _source) {
  return [];
}
