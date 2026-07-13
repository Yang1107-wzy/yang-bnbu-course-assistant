import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRuntimeControl,
  applyScheduleTick,
  createRuntimeControlV3,
  createRuntimeStateV3,
  reconcilePendingActionsV3,
  recordPendingAction,
  scheduleRuntime,
  startManualRuntime,
  stopRuntime
} from "../src/runtime_state.js";
import { DEFAULT_SELECTION_WINDOWS, validateSelectionWindows } from "../src/time_scheduler.js";

const windows = validateSelectionWindows(DEFAULT_SELECTION_WINDOWS).windows;

test("creates a clean v3 state without old armed or fixed-poll fields", () => {
  const state = createRuntimeStateV3(1000);
  assert.equal(state.version, 3);
  assert.equal(state.mode, "STOPPED");
  assert.equal(state.running, false);
  assert.equal(state.scheduleEnabled, false);
  assert.equal(state.pollPhase, "STOPPED");
  assert.equal(state.nextReloadAt, null);
  assert.equal(state.clockSync.source, "LOCAL");
  assert.equal("armedUntil" in state, false);
  assert.equal("pollIntervalSeconds" in state, false);
});

test("manual start runs immediately and Stop clears manual or scheduled work", () => {
  const dirty = {
    ...createRuntimeStateV3(1000),
    actionQueue: [{ key: "stale" }],
    actionLock: { ownerId: "old" },
    lastError: "old-error"
  };
  const started = startManualRuntime(dirty, 2000);
  assert.equal(started.mode, "MANUAL");
  assert.equal(started.running, true);
  assert.equal(started.pollPhase, "FAST");
  assert.deepEqual(started.actionQueue, []);
  const stopped = stopRuntime({ ...started, actionQueue: [{ key: "new" }], actionLock: { ownerId: "x" } }, 3000);
  assert.equal(stopped.mode, "STOPPED");
  assert.equal(stopped.running, false);
  assert.equal(stopped.scheduleEnabled, false);
  assert.deepEqual(stopped.actionQueue, []);
  assert.deepEqual(stopped.pendingActions, {});
});

test("scheduled mode waits, runs inside windows, pauses between rounds and stops after the final round", () => {
  const scheduled = scheduleRuntime(createRuntimeStateV3(1000), windows, windows[0].startAt - 700000);
  assert.equal(scheduled.mode, "SCHEDULED");
  assert.equal(scheduled.running, false);
  assert.equal(scheduled.pollPhase, "WAITING");

  const active = applyScheduleTick(scheduled, windows[0].startAt);
  assert.equal(active.running, true);
  assert.equal(active.activeWindowId, "round-1");
  assert.equal(active.pollPhase, "FAST");

  const between = applyScheduleTick(active, windows[0].endAt);
  assert.equal(between.mode, "SCHEDULED");
  assert.equal(between.running, false);
  assert.equal(between.activeWindowId, null);
  assert.equal(between.nextTransitionAt, windows[1].startAt);

  const complete = applyScheduleTick(between, windows.at(-1).endAt);
  assert.equal(complete.mode, "STOPPED");
  assert.equal(complete.running, false);
  assert.equal(complete.scheduleEnabled, false);
});

test("an authoritative v3 Stop control overrides a stale running worker snapshot", () => {
  const staleWorkerState = {
    ...startManualRuntime(createRuntimeStateV3(1000), 2000),
    actionQueue: [{ key: "stale-action" }],
    actionLock: { ownerId: "stale-worker" }
  };
  const stoppedControl = { ...createRuntimeControlV3(3000), lastError: "manual-stop" };
  const merged = applyRuntimeControl(staleWorkerState, stoppedControl);
  assert.equal(merged.mode, "STOPPED");
  assert.equal(merged.running, false);
  assert.equal(merged.lastError, "manual-stop");
  assert.deepEqual(merged.actionQueue, []);
  assert.equal(merged.actionLock, null);
});

test("blocks a submitted action until Selected or Waiting is observed", () => {
  let pending = recordPendingAction({}, "DEMO1001:1001", "SELECT", 1000);
  let result = reconcilePendingActionsV3(pending, { "DEMO1001:1001": "SELECTABLE" }, 5000);
  assert.equal(result.blocked.has("DEMO1001:1001"), true);
  result = reconcilePendingActionsV3(pending, { "DEMO1001:1001": "REGISTERED" }, 6000);
  assert.equal(result.verified.length, 1);
  assert.deepEqual(result.pendingActions, {});

  pending = recordPendingAction({}, "DEMO3001:1002", "JOIN_WAITLIST", 1000);
  result = reconcilePendingActionsV3(pending, { "DEMO3001:1002": "WAITING" }, 6000);
  assert.equal(result.verified.length, 1);

  pending = recordPendingAction({}, "DEMO1001:1001", "SELECT", 1000);
  result = reconcilePendingActionsV3(pending, { "DEMO1001:1001": "SELECTABLE" }, 16001);
  assert.equal(result.failed.length, 1);
  assert.equal(result.blocked.size, 0);
});
