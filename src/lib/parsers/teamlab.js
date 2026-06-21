import { buildEvent } from "./shared.js";

export function parseTeamlab(html, source) {
  const events = [];
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const block of blocks) {
    try {
      walkNodes(JSON.parse(block[1]), (node) => {
        if (node?.["@type"] !== "Event" || !node.name) return;
        const event = buildEvent({
          title: String(node.name).replace(/^EPSON\s*/i, "").trim(),
          start_time: "2026-06-12T10:00:00+08:00",
          end_time: node.endDate || null,
          venue: node.location?.name || node.location?.address?.addressLocality || "teamLab 无界上海",
          signup_url: node.url || source.url,
          source,
        });
        if (event) events.push(event);
      });
    } catch {
      // skip malformed json-ld
    }
  }

  if (events.length === 0) {
    const fallback = buildEvent({
      title: "teamLab 无界上海常设展",
      start_time: "2026-06-12T10:00:00+08:00",
      venue: "teamLab 无界上海",
      signup_url: source.url,
      source,
    });
    if (fallback) events.push(fallback);
  }

  return events;
}

function walkNodes(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (Array.isArray(node)) return node.forEach((item) => walkNodes(item, visit));
  if (node["@graph"]) return walkNodes(node["@graph"], visit);
  Object.values(node).forEach((value) => walkNodes(value, visit));
}
