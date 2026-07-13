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

test("evaluates waiting, preheat, accelerate, fast, active and complete boundaries", () => {
  const windows = validateSelectionWindows(DEFAULT_SELECTION_WINDOWS).windows;
  const first = windows[0];
  assert.equal(evaluateSchedule(windows, first.startAt - 600001).phase, "WAITING");
  assert.equal(evaluateSchedule(windows, first.startAt - 600000).phase, "PREHEAT");
  assert.equal(evaluateSchedule(windows, first.startAt - 60000).phase, "ACCELERATE");
  assert.equal(evaluateSchedule(windows, first.startAt - 10000).phase, "FAST");
  assert.equal(evaluateSchedule(windows, first.startAt).activeWindow.id, "round-1");
  assert.equal(evaluateSchedule(windows, first.endAt).nextWindow.id, "round-2");
  assert.equal(evaluateSchedule(windows, windows.at(-1).endAt).phase, "COMPLETE");
});

test("derives polling phase for manual, scheduled, stopped and submitting modes", () => {
  assert.equal(pollPhaseFor({ mode: "MANUAL", schedule: null, submitting: false }), "FAST");
  assert.equal(pollPhaseFor({ mode: "SCHEDULED", schedule: { phase: "PREHEAT" }, submitting: false }), "PREHEAT");
  assert.equal(pollPhaseFor({ mode: "STOPPED", schedule: null, submitting: false }), "STOPPED");
  assert.equal(pollPhaseFor({ mode: "MANUAL", schedule: null, submitting: true }), "PAUSED");
});

test("keeps every randomized delay within its phase and FE stagger bounds", () => {
  assert.equal(randomPollDelayMs({ phase: "WAITING", category: "ME", random: () => 0.5 }), null);
  assert.equal(randomPollDelayMs({ phase: "PREHEAT", category: "ME", random: () => 0 }), 15000);
  assert.equal(randomPollDelayMs({ phase: "PREHEAT", category: "ME", random: () => 1 }), 25000);
  assert.equal(randomPollDelayMs({ phase: "ACCELERATE", category: "ME", random: () => 0 }), 4000);
  assert.equal(randomPollDelayMs({ phase: "ACCELERATE", category: "ME", random: () => 1 }), 7000);
  assert.equal(randomPollDelayMs({ phase: "FAST", category: "ME", random: () => 0 }), 1500);
  assert.equal(randomPollDelayMs({ phase: "FAST", category: "ME", random: () => 1 }), 2500);
  assert.equal(randomPollDelayMs({ phase: "FAST", category: "FE", random: () => 1 }), 2850);
});

test("recognizes completion only when every target is registered", () => {
  const targets = [{ id: "A:1001" }, { id: "B:1001" }];
  assert.equal(allTargetsRegistered(targets, { "A:1001": { status: "REGISTERED" }, "B:1001": { status: "REGISTERED" } }), true);
  assert.equal(allTargetsRegistered(targets, { "A:1001": { status: "REGISTERED" }, "B:1001": { status: "WAITING" } }), false);
});
