import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgenda,
  eventEndDay,
  featureRunning,
  formatRange,
  isMultiDay,
  pickHighlights,
  splitByToday,
} from "../src/lib/agenda.js";

const TODAY = "2026-10-04";

test("single-day events without a later end_time are not multi-day", () => {
  const talk = event("讲座", "2026-10-05T14:00:00+08:00");
  const sameDay = event("音乐会", "2026-10-05T19:30:00+08:00", "2026-10-05T21:30:00+08:00");

  assert.equal(isMultiDay(talk), false);
  assert.equal(isMultiDay(sameDay), false);
  assert.equal(eventEndDay(sameDay), "2026-10-05");
  assert.equal(formatRange(talk), "");
});

test("a multi-day event appears on its first day, its last day, and as running in between", () => {
  const show = event("驻场演出", "2026-10-06T19:30:00+08:00", "2026-10-09T21:00:00+08:00");
  const agenda = buildAgenda([show], { today: TODAY, days: 7 });
  const kinds = Object.fromEntries(agenda.map((day) => [day.date, day.rows.map((row) => row.kind)]));

  assert.deepEqual(kinds["2026-10-05"], []);
  assert.deepEqual(kinds["2026-10-06"], ["start"]);
  assert.deepEqual(kinds["2026-10-07"], ["run"]);
  assert.deepEqual(kinds["2026-10-08"], ["run"]);
  assert.deepEqual(kinds["2026-10-09"], ["last"]);
  assert.deepEqual(kinds["2026-10-10"], []);
  assert.equal(formatRange(show), "10.06 — 10.09 · 共 4 天");
});

test("a day with nothing starting still shows running events up to the minimum row count", () => {
  const exhibitions = Array.from({ length: 12 }, (_, index) =>
    event(`长期展览 ${index}`, "2026-09-01T10:00:00+08:00", "2026-12-01T18:00:00+08:00"),
  );
  const [day] = buildAgenda(exhibitions, { today: TODAY, days: 1, minRows: 5 });

  assert.equal(day.startCount, 0);
  assert.equal(day.rows.length, 5);
  assert.ok(day.rows.every((row) => row.kind === "run"));
  assert.equal(day.folded.length, 7);
  assert.equal(day.runningCount, 12);
});

test("running events are not featured when the day already has enough of its own rows", () => {
  const starts = Array.from({ length: 6 }, (_, index) => event(`当日活动 ${index}`, `2026-10-04T1${index}:00:00+08:00`));
  const running = event("长期展览", "2026-09-01T10:00:00+08:00", "2026-12-01T18:00:00+08:00");
  const [day] = buildAgenda([...starts, running], { today: TODAY, days: 1, minRows: 5 });

  assert.equal(day.rows.length, 6);
  assert.deepEqual(day.folded, [running]);
});

test("events ending soon are featured first and the rest rotate by day", () => {
  const endingSoon = event("快结束的展", "2026-09-01T10:00:00+08:00", "2026-10-06T18:00:00+08:00");
  const others = Array.from({ length: 6 }, (_, index) =>
    event(`长期展览 ${index}`, "2026-09-01T10:00:00+08:00", "2026-12-01T18:00:00+08:00"),
  );
  const running = [...others, endingSoon];

  const first = featureRunning(running, TODAY, 3, 0).featured;
  const second = featureRunning(running, TODAY, 3, 1).featured;

  assert.equal(first[0], endingSoon);
  assert.equal(second[0], endingSoon);
  assert.notDeepEqual(first.slice(1), second.slice(1));
});

test("splitByToday separates ongoing from upcoming and drops finished events", () => {
  const ongoing = event("在展", "2026-09-01T10:00:00+08:00", "2026-10-20T18:00:00+08:00");
  const finished = event("已结束", "2026-09-01T10:00:00+08:00", "2026-10-01T18:00:00+08:00");
  const later = event("下周演出", "2026-10-10T20:00:00+08:00");
  const sooner = event("今晚演出", "2026-10-04T20:00:00+08:00");
  const result = splitByToday([ongoing, finished, later, sooner], TODAY);

  assert.deepEqual(result.ongoing, [ongoing]);
  assert.deepEqual(result.upcoming, [sooner, later]);
});

test("pickHighlights prefers one event per category and requires a cover image", () => {
  const ranked = [
    { ...event("演出 A", "2026-10-05T20:00:00+08:00"), category: "演出音乐", image_url: "https://img/a.jpg" },
    { ...event("演出 B", "2026-10-06T20:00:00+08:00"), category: "演出音乐", image_url: "https://img/b.jpg" },
    { ...event("无图展览", "2026-10-06T10:00:00+08:00"), category: "展览" },
    { ...event("展览 C", "2026-10-07T10:00:00+08:00"), category: "展览", image_url: "https://img/c.jpg" },
  ];
  const picks = pickHighlights(ranked, { today: TODAY, limit: 3 });

  assert.deepEqual(picks.map((item) => item.title), ["演出 A", "展览 C", "演出 B"]);
});

function event(title, start_time, end_time = null) {
  return { title, start_time, end_time, venue: "上海", category: "展览", dedupe_key: title };
}
