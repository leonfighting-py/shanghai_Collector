import { parseListingSite } from "./listing.js";

export function parseTongjiSeeEvents(html, source, context) {
  return parseListingSite(html, source, {
    ...context,
    linkFilter: (href, label) =>
      /info\/\d+\/\d+\.htm/.test(href) &&
      label.trim().length >= 10 &&
      !/招生|复试|考试|招聘|招标|申请流程|展厅|史馆/.test(label),
    defaultVenue: "同济大学",
    maxLinks: 6,
  });
}
