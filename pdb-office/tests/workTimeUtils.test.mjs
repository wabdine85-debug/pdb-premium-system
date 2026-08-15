import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateNetMinutes,
  entriesForMonth,
  formatMinutes,
  summarizeMonth,
  timeToMinutes,
} from "../modules/work-time/workTimeUtils.js";

test("converts valid clock times to minutes", () => {
  assert.equal(timeToMinutes("08:30"), 510);
  assert.equal(timeToMinutes("24:00"), null);
  assert.equal(timeToMinutes("8:30"), null);
});

test("calculates working time after the break", () => {
  assert.equal(calculateNetMinutes({ startTime: "09:00", endTime: "17:30", breakMinutes: 30 }), 480);
  assert.equal(calculateNetMinutes({ startTime: "17:00", endTime: "09:00", breakMinutes: 0 }), 0);
  assert.equal(calculateNetMinutes({ startTime: "09:00", endTime: "09:15", breakMinutes: 30 }), 0);
});

test("formats durations as hours and minutes", () => {
  assert.equal(formatMinutes(0), "0:00 Std.");
  assert.equal(formatMinutes(485), "8:05 Std.");
});

test("filters and summarizes entries for one month", () => {
  const entries = [
    { staffMemberId: "a", date: "2026-08-01", startTime: "09:00", endTime: "17:00", breakMinutes: 30 },
    { staffMemberId: "a", date: "2026-08-02", startTime: "10:00", endTime: "14:00", breakMinutes: 0 },
    { staffMemberId: "b", date: "2026-07-30", startTime: "09:00", endTime: "12:00", breakMinutes: 0 },
  ];

  assert.equal(entriesForMonth(entries, "2026-08").length, 2);
  const summary = summarizeMonth(entries, [{ id: "a" }, { id: "b" }], "2026-08");
  assert.equal(summary.totalMinutes, 690);
  assert.equal(summary.totals.get("a"), 690);
  assert.equal(summary.totals.get("b"), 0);
});
