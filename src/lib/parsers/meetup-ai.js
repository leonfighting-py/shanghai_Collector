import { isAiMeetupContent } from "../category-filter.js";
import { parseJsonLdEvents } from "./json-ld.js";
import { parseLuma } from "./luma.js";

export function parseMeetupAiEvents(html, source, context) {
  return parseJsonLdEvents(html, source, context).filter((event) => isAiMeetupContent(event) !== false);
}

export function parseLumaAiEvents(html, source, context) {
  return parseLuma(html, source, context).filter((event) => isAiMeetupContent(event) !== false);
}
