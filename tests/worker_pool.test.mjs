import assert from "node:assert/strict";
import test from "node:test";

import * as workerPoolModule from "../src/worker_pool.js";

import {
  buildWorkerAssignments,
  categoryCoverageIsHealthy,
  claimWorkerSlot,
  createWorkerUrl,
  heartbeatHotPage,
  heartbeatWorkerSlot,
  markWorkerPhase,
  parseWorkerMarker,
  reserveWorkerOpening,
  workerSlotIsHealthy
} from "../src/worker_pool.js";

const target = (courseCode, section, category) => ({
  id: `${courseCode}:${section}`,
  courseCode,
  courseName: `${courseCode} Course`,
  section,
  category
});

test("assigns every target in one category to one shared worker", () => {
  const assignments = buildWorkerAssignments([
    target("COMP3073", "1002", "ME"),
    target("COMP4213", "1001", "ME"),
    target("EBIS3113", "1002", "FE")
  ], 6);
  assert.deepEqual(assignments.map(({ slotId, category, targetIds }) => ({ slotId, category, targetIds })), [
    { slotId: "ME-1", category: "ME", targetIds: ["COMP3073:1002", "COMP4213:1001"] },
    { slotId: "FE-1", category: "FE", targetIds: ["EBIS3113:1002"] }
  ]);
});

test("never creates more than one worker per supported category", () => {
  const targets = [
    ...Array.from({ length: 8 }, (_, index) => target(`ME${index + 1}`, "1001", "ME")),
    ...Array.from({ length: 2 }, (_, index) => target(`FE${index + 1}`, "1001", "FE"))
  ];
  const assignments = buildWorkerAssignments(targets, 6);
  assert.equal(assignments.length, 2);
  assert.equal(new Set(assignments.flatMap((slot) => slot.targetIds)).size, 10);
  assert.ok(assignments.some((slot) => slot.category === "ME"));
  assert.ok(assignments.some((slot) => slot.category === "FE"));
});

test("encodes only category identity and generation into the detail URL", () => {
  const slot = { slotId: "ME-1", category: "ME", generation: 2, targetIds: ["COMP4213:1001"] };
  const url = createWorkerUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me", slot, "open-2");
  const marker = parseWorkerMarker(new URL(url));
  assert.deepEqual(marker, { slotId: "ME-1", category: "ME", generation: 2, openingToken: "open-2" });
  assert.equal(new URL(url).hash.includes("COMP4213"), false);
});

test("opening and owner leases prevent duplicates until sixty-second heartbeat expiry", () => {
  const slot = { slotId: "ME-1", category: "ME", targetIds: ["COMP3073:1002"] };
  const first = reserveWorkerOpening({}, slot, "open-a", 1000, 30000, 60000);
  assert.equal(first.reserved, true);
  assert.equal(reserveWorkerOpening(first.registry, slot, "open-b", 2000, 30000, 60000).reserved, false);

  const claimed = claimWorkerSlot(first.registry, slot, "worker-a", "open-a", 3000, 60000);
  assert.equal(claimed.claimed, true);
  assert.equal(workerSlotIsHealthy(claimed.registry, "ME-1", 62000, 60000), true);
  assert.equal(reserveWorkerOpening(claimed.registry, slot, "open-c", 62000, 30000, 60000).reserved, false);

  const heartbeat = heartbeatWorkerSlot(claimed.registry, "ME-1", "worker-a", 62000);
  assert.equal(heartbeat.updated, true);
  assert.equal(workerSlotIsHealthy(heartbeat.registry, "ME-1", 121999, 60000), true);
  assert.equal(workerSlotIsHealthy(heartbeat.registry, "ME-1", 122001, 60000), false);
  assert.equal(reserveWorkerOpening(heartbeat.registry, slot, "open-d", 122001, 30000, 60000).reserved, true);
});

test("batch opening reserves every missing slot in one registry update", () => {
  assert.equal(typeof workerPoolModule.reserveWorkerOpenings, "function");
  const slots = buildWorkerAssignments([
    target("COMP3073", "1002", "ME"),
    target("COMP4213", "1001", "ME"),
    target("EBIS3113", "1002", "FE")
  ], 6);
  const result = workerPoolModule.reserveWorkerOpenings(
    {},
    slots,
    (slot) => `open-${slot.slotId}`,
    1000,
    60000,
    60000
  );
  assert.deepEqual(result.reservations.map(({ slot, openingToken }) => [slot.slotId, openingToken]), [
    ["ME-1", "open-ME-1"],
    ["FE-1", "open-FE-1"]
  ]);
  assert.equal(result.registry["ME-1"].openingUntil, 61000);
  assert.equal(result.registry["FE-1"].openingUntil, 61000);
});

test("an expired fifteen-second opening becomes a visible failed phase before retry", () => {
  const slot = { slotId: "ME-1", category: "ME", generation: 2, targetIds: ["COMP3073:1002", "COMP4213:1001"] };
  const first = reserveWorkerOpening({}, slot, "open-a", 1000, 15000, 60000);
  const failed = reserveWorkerOpening(first.registry, slot, "open-b", 16001, 15000, 60000);
  assert.equal(failed.reserved, false);
  assert.equal(failed.registry["ME-1"].phase, "FAILED");
  assert.equal(failed.registry["ME-1"].lastError, "worker-open-timeout");
  assert.equal(failed.registry["ME-1"].retryAt, 21000);
  const retried = reserveWorkerOpening(failed.registry, slot, "open-c", 21000, 15000, 60000);
  assert.equal(retried.reserved, true);
  assert.equal(retried.registry["ME-1"].retryCount, 1);
});

test("a healthy manual hot page covers its category and blocks a duplicate worker opening", () => {
  const hot = heartbeatHotPage({}, "ME", "manual-tab", 1000, 1000);
  assert.equal(categoryCoverageIsHealthy(hot.registry, "ME", 2000, 60000), true);
  const slot = { slotId: "ME-1", category: "ME", generation: 2, targetIds: ["COMP3073:1002", "COMP4213:1001"] };
  const opening = reserveWorkerOpening(hot.registry, slot, "open-a", 2000, 15000, 60000);
  assert.equal(opening.reserved, false);
  assert.deepEqual(opening.registry, hot.registry);
});

test("a duplicate claimant cannot take a healthy owned slot", () => {
  const slot = { slotId: "FE-1", category: "FE", targetIds: ["EBIS3113:1002"] };
  const reserved = reserveWorkerOpening({}, slot, "open-a", 1000, 30000, 60000);
  const owner = claimWorkerSlot(reserved.registry, slot, "worker-a", "open-a", 2000, 60000);
  const loser = claimWorkerSlot(owner.registry, slot, "worker-b", "wrong-token", 3000, 60000);
  assert.equal(loser.claimed, false);
  assert.equal(loser.registry["FE-1"].ownerId, "worker-a");
});

test("a claimed worker remains category coverage while submitting", () => {
  const slot = { slotId: "ME-1", category: "ME", generation: 2, targetIds: ["COMP3073:1002", "COMP4213:1001"] };
  const reserved = reserveWorkerOpening({}, slot, "open-a", 1000, 15000, 60000);
  const owner = claimWorkerSlot(reserved.registry, slot, "worker-a", "open-a", 2000, 60000);
  const submitting = markWorkerPhase(owner.registry, "ME-1", "worker-a", "SUBMITTING", 2500);
  assert.equal(submitting.updated, true);
  assert.equal(submitting.registry["ME-1"].phase, "SUBMITTING");
  assert.equal(categoryCoverageIsHealthy(submitting.registry, "ME", 3000, 60000), true);
});
