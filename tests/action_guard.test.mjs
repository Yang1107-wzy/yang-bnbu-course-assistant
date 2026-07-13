import assert from "node:assert/strict";
import test from "node:test";

import { ActionGuard } from "../src/action_guard.js";

const guard = () => new ActionGuard({
  minimumActionIntervalMs: 5000,
  sameCourseCooldownMs: 30000,
  maxActionsPerMinute: 2,
  maxConsecutiveErrors: 3
});

test("enforces minimum interval and same-course cooldown", () => {
  const actionGuard = guard();
  assert.equal(actionGuard.canAct("DEMO1001:1001", 100000).allowed, true);
  actionGuard.recordAction("DEMO1001:1001", 100000);
  assert.equal(actionGuard.canAct("DEMO3001:1002", 103000).reason, "minimum-action-interval");
  assert.equal(actionGuard.canAct("DEMO1001:1001", 106000).reason, "same-course-cooldown");
  assert.equal(actionGuard.canAct("DEMO1001:1001", 131000).allowed, true);
});

test("limits the global action budget to two per rolling minute", () => {
  const actionGuard = guard();
  actionGuard.recordAction("A:1001", 100000);
  actionGuard.recordAction("B:1001", 106000);
  assert.equal(actionGuard.canAct("C:1001", 112000).reason, "max-actions-per-minute");
  assert.equal(actionGuard.canAct("C:1001", 161000).allowed, true);
});

test("panic stop and three consecutive errors block future actions", () => {
  const panic = guard();
  panic.panicStop("escape");
  assert.equal(panic.canAct("DEMO1001:1001", 100000).reason, "panic-stopped:escape");

  const errors = guard();
  errors.recordError();
  errors.recordError();
  assert.equal(errors.recordError().stopped, true);
  assert.equal(errors.canAct("DEMO1001:1001", 100000).reason, "panic-stopped:max-consecutive-errors");
});

test("a successful action clears the consecutive error count", () => {
  const actionGuard = guard();
  actionGuard.recordError();
  actionGuard.recordAction("DEMO1001:1001", 100000);
  assert.equal(actionGuard.consecutiveErrors, 0);
});

test("restores cooldown and action budget from a persisted snapshot", () => {
  const original = guard();
  original.recordAction("DEMO1001:1001", 100000);
  const restored = ActionGuard.fromSnapshot(original.toSnapshot(), original.config);
  assert.equal(restored.canAct("DEMO1001:1001", 106000).reason, "same-course-cooldown");
  assert.equal(restored.canAct("DEMO3001:1002", 103000).reason, "minimum-action-interval");
});
