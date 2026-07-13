import assert from "node:assert/strict";
import test from "node:test";

import { actionSignatureMatches, claimNextAction, enqueueCandidates, finishAction } from "../src/action_queue.js";

const candidate = (courseCode, action = "SELECT") => ({
  target: { id: `${courseCode}:1001`, courseCode, section: "1001" },
  decision: { action },
  row: {
    selectAction: { functionName: "selectItem", argument: `sei-${courseCode.toLowerCase()}` },
    joinWaitingAction: { functionName: "joinWaiting", argument: `sei-${courseCode.toLowerCase()}` }
  }
});

test("enqueues all candidates in FIFO order without duplicates", () => {
  const queue = enqueueCandidates([], [candidate("DEMO1001"), candidate("DEMO2001"), candidate("DEMO1001")], "ME-tab", 1000);
  assert.deepEqual(queue.map((item) => item.courseCode), ["DEMO1001", "DEMO2001"]);
  assert.equal(queue.every((item) => item.workerId === "ME-tab"), true);
  assert.equal(queue[0].functionName, "selectItem");
  assert.equal(queue[0].argument, "sei-demo1001");
});

test("allows only the owning worker to claim the FIFO head", () => {
  const queue = enqueueCandidates([], [candidate("DEMO1001")], "ME-tab", 1000);
  const wrong = claimNextAction({ actionQueue: queue, actionLock: null, lastActionAt: null }, "FE-tab", 2000, 1200);
  assert.equal(wrong.claimed, null);
  const right = claimNextAction({ actionQueue: queue, actionLock: null, lastActionAt: null }, "ME-tab", 2000, 1200);
  assert.equal(right.claimed.courseCode, "DEMO1001");
  assert.equal(right.state.actionLock.ownerId, "ME-tab");
});

test("keeps 1.2 seconds between actions and removes completed work", () => {
  const queue = enqueueCandidates([], [candidate("DEMO1001"), candidate("DEMO2001")], "ME-tab", 1000);
  const first = claimNextAction({ actionQueue: queue, actionLock: null, lastActionAt: null }, "ME-tab", 2000, 1200);
  const finished = finishAction(first.state, first.claimed.key, 2000);
  assert.deepEqual(finished.actionQueue.map((item) => item.courseCode), ["DEMO2001"]);
  assert.equal(claimNextAction(finished, "ME-tab", 2500, 1200).claimed, null);
  assert.equal(claimNextAction(finished, "ME-tab", 3200, 1200).claimed.courseCode, "DEMO2001");
});

test("rejects a page action whose function or argument changed after it was queued", () => {
  const queued = enqueueCandidates([], [candidate("DEMO1001")], "ME-tab", 1000)[0];
  assert.equal(actionSignatureMatches(queued, candidate("DEMO1001")), true);
  const changed = candidate("DEMO1001");
  changed.row.selectAction.argument = "different-item";
  assert.equal(actionSignatureMatches(queued, changed), false);
});
