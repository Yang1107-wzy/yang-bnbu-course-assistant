import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createDefaultConfig } from "../src/config_manager.js";
import { CourseStatus, parseCourseRows } from "../src/course_parser.js";
import { planCourseScan, reconcilePendingActions } from "../src/runtime_engine.js";

const names = {
  DEMO1001: "Example Major Elective (1001)",
  DEMO2001: "Example Technology Course (1001)"
};
const row = (courseCode, status) => ({ courseCode, courseName: names[courseCode], section: "1001", status });

test("plans two demo targets independently when both are selectable", () => {
  const config = createDefaultConfig();
  const result = planCourseScan({
    targets: config.targets,
    rows: [row("DEMO1001", CourseStatus.SELECTABLE), row("DEMO2001", CourseStatus.SELECTABLE)],
    context: {
      running: true,
      courseStatuses: {},
      creditSummaries: { ME: { selected: 0, waiting: 0, assigned: 6 } },
      waitlistCounts: {}
    }
  });
  assert.deepEqual(result.candidates.map((item) => item.target.courseCode), ["DEMO1001", "DEMO2001"]);
});

test("keeps one demo selectable while another demo is waiting", () => {
  const config = createDefaultConfig();
  const result = planCourseScan({
    targets: config.targets,
    rows: [row("DEMO1001", CourseStatus.WAITING), row("DEMO2001", CourseStatus.SELECTABLE)],
    context: {
      running: true,
      courseStatuses: {},
      creditSummaries: { ME: { selected: 0, waiting: 3, assigned: 6 } },
      waitlistCounts: {}
    }
  });
  assert.equal(result.courseStatuses.DEMO1001, CourseStatus.WAITING);
  assert.deepEqual(result.candidates.map((item) => item.target.courseCode), ["DEMO2001"]);
});

test("returns every independently selectable target as a candidate", async () => {
  const html = await readFile(new URL("./fixtures/multi_selectable.html", import.meta.url), "utf8");
  const dom = new JSDOM(html);
  const rows = parseCourseRows(dom.window.document);
  const targets = createDefaultConfig().targets;
  const result = planCourseScan({
    targets,
    rows,
    context: { running: true, courseStatuses: {}, creditSummaries: {}, waitlistCounts: {} }
  });
  assert.deepEqual(result.candidates.map((item) => item.target.courseCode), ["DEMO1001", "DEMO2001", "DEMO3001"]);
});

test("preserves statuses learned from other tabs and returns no action for missing rows", () => {
  const config = createDefaultConfig();
  const result = planCourseScan({
    targets: config.targets,
    rows: [],
    context: {
      running: true,
      courseStatuses: { DEMO3001: CourseStatus.REGISTERED },
      creditSummaries: {},
      waitlistCounts: {}
    }
  });
  assert.equal(result.courseStatuses.DEMO3001, CourseStatus.REGISTERED);
  assert.equal(result.next, null);
});

test("verifies submitted actions and applies 15s/30s retry backoff", () => {
  const submitted = {
    DEMO1001: {
      action: "SELECT",
      stage: "VERIFYING",
      verifyAt: 115000,
      failureCount: 0
    }
  };

  const waiting = reconcilePendingActions(submitted, { DEMO1001: "SELECTABLE" }, 110000);
  assert.equal(waiting.blockedCourses.has("DEMO1001"), true);
  assert.equal(waiting.failed.length, 0);

  const firstFailure = reconcilePendingActions(submitted, { DEMO1001: "SELECTABLE" }, 115000);
  assert.equal(firstFailure.pendingActions.DEMO1001.retryAt, 130000);
  assert.equal(firstFailure.pendingActions.DEMO1001.failureCount, 1);

  const retryReady = reconcilePendingActions(firstFailure.pendingActions, { DEMO1001: "SELECTABLE" }, 130000);
  assert.equal(retryReady.pendingActions.DEMO1001.stage, "READY");
  assert.equal(retryReady.blockedCourses.has("DEMO1001"), false);

  const secondSubmitted = {
    DEMO1001: { ...retryReady.pendingActions.DEMO1001, stage: "VERIFYING", verifyAt: 145000, retryAt: null }
  };
  const secondFailure = reconcilePendingActions(secondSubmitted, { DEMO1001: "SELECTABLE" }, 145000);
  assert.equal(secondFailure.pendingActions.DEMO1001.retryAt, 175000);
  assert.equal(secondFailure.pendingActions.DEMO1001.failureCount, 2);

  const verified = reconcilePendingActions(secondSubmitted, { DEMO1001: "REGISTERED" }, 140000);
  assert.equal(verified.pendingActions.DEMO1001, undefined);
  assert.equal(verified.verified[0].courseCode, "DEMO1001");
});

test("stops after three unverified action submissions", () => {
  const pending = {
    DEMO3001: {
      action: "JOIN_WAITLIST",
      stage: "VERIFYING",
      verifyAt: 1000,
      failureCount: 2
    }
  };
  const result = reconcilePendingActions(pending, { DEMO3001: "WAITLIST_AVAILABLE" }, 1000);
  assert.equal(result.stopReason, "action-verification-failed:DEMO3001");
});
