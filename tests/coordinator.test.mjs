import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireActionLock,
  armCoordinator,
  consumeReloadLease,
  createCoordinatorState,
  createReloadLease,
  isArmed,
  attemptPersistentActionLock,
  recordHeartbeat,
  shouldPanicForMissingController
} from "../src/coordinator.js";

test("arms for ten minutes and expires automatically", () => {
  const state = armCoordinator(createCoordinatorState(1000), 1000, 10);
  assert.equal(isArmed(state, 600000), true);
  assert.equal(isArmed(state, 601001), false);
});

test("grants one expiring global action lock", () => {
  const state = createCoordinatorState(1000);
  const first = acquireActionLock(state, "me-tab", 1000, 15000);
  const blocked = acquireActionLock(first.state, "fe-tab", 2000, 15000);
  const afterExpiry = acquireActionLock(first.state, "fe-tab", 16001, 15000);
  assert.equal(first.acquired, true);
  assert.equal(blocked.acquired, false);
  assert.equal(afterExpiry.acquired, true);
});

test("restores only a fresh matching script-created reload lease", () => {
  const lease = createReloadLease("ME", "/mis/student/es/eleDetail.do", 1000, 10000);
  assert.equal(consumeReloadLease(lease, "/mis/student/es/eleDetail.do", 9000).valid, true);
  assert.equal(consumeReloadLease(lease, "/mis/student/es/elective.do", 9000).valid, false);
  assert.equal(consumeReloadLease(lease, "/mis/student/es/eleDetail.do", 12000).valid, false);
});

test("panics when the controller heartbeat is older than 45 seconds", () => {
  const state = recordHeartbeat(createCoordinatorState(1000), "controller", "controller-tab", 1000);
  assert.equal(shouldPanicForMissingController(state, 45000, 45000), false);
  assert.equal(shouldPanicForMissingController(state, 46001, 45000), true);
});

test("verifies a persisted lock after writing so only the surviving owner proceeds", async () => {
  let stored = createCoordinatorState(1000);
  const storage = {
    get: async () => stored,
    set: async (value) => { stored = value; }
  };
  const first = await attemptPersistentActionLock({ storage, ownerId: "me-tab", nonce: "me-1", now: 1000, ttlMs: 15000, settle: async () => {} });
  const second = await attemptPersistentActionLock({ storage, ownerId: "fe-tab", nonce: "fe-1", now: 2000, ttlMs: 15000, settle: async () => {} });
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(stored.actionLock.ownerId, "me-tab");
});
