import { parseJsonLdEvents } from "./json-ld.js";

/** Eventbrite city listings expose rich JSON-LD events. */
export function parseEventbrite(html, source) {
  return parseJsonLdEvents(html, source);
}

export function parseEventbriteAiTech(html, source) {
  return parseEventbrite(html, source).filter((event) => AI_TECH_TITLE_PATTERN.test(event.title));
}

const AI_TECH_TITLE_PATTERN =
  /\b(ai|artificial intelligence|tech|data|startup|fintech|machine learning|cloud|computer|robot|automation|software|developer|agent)\b/i;
