import { buildEvent } from "./shared.js";

export function parseJsonLdEvents(html, source) {
  const events = [];
  const scriptMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of scriptMatches) {
    const text = match[1].trim();
    try {
      const data = JSON.parse(text);
      for (const candidate of flattenJsonLd(data)) {
        if (!isEventNode(candidate)) continue;
        const event = eventFromJsonLd(candidate, source);
        if (event) events.push(event);
      }
    } catch {
      // skip malformed blocks
    }
  }

  return events;
}

function flattenJsonLd(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flattenJsonLd);
  if (node["@graph"]) return flattenJsonLd(node["@graph"]);
  if (node.itemListElement) return node.itemListElement.map((item) => item.item || item);
  return [node];
}

function isEventNode(candidate) {
  const type = candidate?.["@type"];
  return type === "Event" || (Array.isArray(type) && type.includes("Event"));
}

function eventFromJsonLd(candidate, source) {
  const location = candidate.location;
  const venue =
    typeof location === "string"
      ? location
      : location?.name || location?.address?.streetAddress || location?.address?.name || "上海";

  return buildEvent({
    title: candidate.name,
    start_time: candidate.startDate,
    end_time: candidate.endDate,
    venue,
    signup_url: candidate.url || candidate.offers?.url || source.url,
    // schema.org Event.image：URL 或 ImageObject
    image_url: normalizeJsonLdImage(candidate.image),
    source,
  });
}

function normalizeJsonLdImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (typeof image?.url === "string") return image.url;
  if (Array.isArray(image) && image.length > 0) return normalizeJsonLdImage(image[0]);
  return null;
}
