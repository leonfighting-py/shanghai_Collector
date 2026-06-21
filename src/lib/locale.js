export function hasCjkText(text) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(text || ""));
}

export function isChinesePreferredEvent(event) {
  return hasCjkText(event?.title);
}
