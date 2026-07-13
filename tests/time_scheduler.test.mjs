import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SELECTION_WINDOWS,
  allTargetsRegistered,
  evaluateSchedule,
  formatBeijingDateTime,
  parseBeijingDateTime,
  pollPhaseFor,
  randomPollDelayMs,
  validateSelectionWindows
} from "../src/time_scheduler.js";

test("parses and formats Beijing wall time independently of local timezone", () => {
  const epoch = Date.UTC(2026, 6, 20, 2, 0, 0);
  assert.equal(parseBeijingDateTime("2026-07-20T10:00:00"), epoch);
  assert.equal(formatBeijingDateTime(epoch), "2026-07-20T10:00:00");
  assert.equal(parseBeijingDateTime("2026-02-30T10:00:00"), null);
  assert.equal(parseBeijingDateTime("not-a-date"), null);
});

test("ships the three official 2026 selection windows", () => {
  assert.deepEqual(DEFAULT_SELECTION_WINDOWS.map(({ id, startText, endText, enabled }) => ({ id, startText, endText, enabled })), [
    { id: "round-1", startText: "2026-07-20T10:00:00", endText: "2026-07-20T13:00:00", enabled: true },
    { id: "round-2", startText: "2026-07-20T15:00:00", endText: "2026-07-20T18:00:00", enabled: true },
    { id: "round-3", startText: "2026-07-21T10:00:00", endText: "2026-07-22T18:00:00", enabled: true }
  ]);
  const result = validateSelectionWindows(DEFAULT_SELECTION_WINDOWS);
  assert.equal(result.valid, true);
  assert.equal(result.windows[0].startAt, Date.UTC(2026, 6, 20, 2, 0, 0));
  assert.equal(result.windows[2].endAt, Date.UTC(2026, 6, 22, 10, 0, 0));
});

test("rejects disabled-only, invalid, duplicate and overlapping windows", () => {
  assert.equal(validateSelectionWindows(DEFAULT_SELECTION_WINDOWS.map((window) => ({ ...window, enabled: false }))).valid, false);
  assert.equal(validateSelectionWindows([{ ...DEFAULT_SELECTION_WINDOWS[0], endText: "bad" }]).valid, false);
  assert.equal(validateSelectionWindows([DEFAULT_SELECTION_WINDOWS[0], { ...DEFAULT_SELECTION_WINDOWS[1], id: "round-1" }]).valid, false);
  assert.equal(validateSelectionWindows([
    DEFAULT_SELECTION_WINDOWS[0],
    { ...DEFAULT_SELECTION_WINDOWS[1], startText: "2026-07-20T12:00:00" }
  ]) .valid, false);
});

test("uses one-second burst only around the opening and three seconds otherwise", () => {
  const windows = validateSelectionWindows(DEFAULT_SELECTION_WINDOWS).windows;
  const first = windows[0];
  assert.equal(evaluateSchedule(windows, first.startAt - 30001).phase, "NORMAL");
  assert.equal(evaluateSchedule(windows, first.startAt - 30000).phase, "BURST");
  assert.equal(evaluateSchedule(windows, first.startAt).phase, "BURST");
  assert.equal(evaluateSchedule(windows, first.startAt + 120000).phase, "NORMAL");
  assert.equal(evaluateSchedule(windows, first.endAt).nextWindow.id, "round-2");
  assert.equal(evaluateSchedule(windows, windows.at(-1).endAt).phase, "COMPLETE");
});

test("derives polling phase for manual, scheduled, stopped and submitting modes", () => {
  assert.equal(pollPhaseFor({ mode: "MANUAL", schedule: null, submitting: false }), "BURST");
  assert.equal(pollPhaseFor({ mode: "SCHEDULED", schedule: { phase: "NORMAL" }, submitting: false }), "NORMAL");
  assert.equal(pollPhaseFor({ mode: "STOPPED", schedule: null, submitting: false }), "STOPPED");
  assert.equal(pollPhaseFor({ mode: "MANUAL", schedule: null, submitting: true }), "PAUSED");
});

test("returns exact one-second burst and three-second normal delays", () => {
  assert.equal(randomPollDelayMs({ phase: "STOPPED", category: "ME", random: () => 0.5 }), null);
  assert.equal(randomPollDelayMs({ phase: "NORMAL", category: "ME", random: () => 0 }), 3000);
  assert.equal(randomPollDelayMs({ phase: "BURST", category: "ME", random: () => 1 }), 1000);
  assert.equal(randomPollDelayMs({ phase: "BURST", category: "FE", random: () => 1 }), 1000);
});

test("recognizes completion only when every target is registered", () => {
  const targets = [{ id: "A:1001" }, { id: "B:1001" }];
  assert.equal(allTargetsRegistered(targets, { "A:1001": { status: "REGISTERED" }, "B:1001": { status: "REGISTERED" } }), true);
  assert.equal(allTargetsRegistered(targets, { "A:1001": { status: "REGISTERED" }, "B:1001": { status: "WAITING" } }), false);
});
