import assert from "node:assert/strict";
import test from "node:test";

import { decideCourseAction } from "../src/decision_engine.js";
import { CourseStatus } from "../src/course_parser.js";

const target = (overrides = {}) => ({
  courseCode: "DEMO1001",
  courseName: "Example Major Elective",
  section: "1001",
  category: "ME",
  allowDirectSelect: true,
  allowJoinWaitingList: true,
  ...overrides
});

const context = (overrides = {}) => ({
  running: true,
  creditSummaries: { ME: { selected: 0, waiting: 0, assigned: 6 } },
  courseStatuses: {},
  waitlistCount: 0,
  ...overrides
});

test("selects a uniquely matched selectable target while running", () => {
  const decision = decideCourseAction(target(), { status: CourseStatus.SELECTABLE }, context());
  assert.deepEqual(decision, {
    action: "SELECT",
    allowed: true,
    reason: "selectable-and-running",
    courseCode: "DEMO1001",
    requiresConfirmation: false
  });
});

test("Test mode never allows an action", () => {
  const result = decideCourseAction(target(), { status: CourseStatus.SELECTABLE }, context({ running: false }));
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "test-only");
});

test("treats the second demo target independently of the first", () => {
  const demo2001 = target({ courseCode: "DEMO2001", courseName: "Example Technology Course", dependsOn: "DEMO1001" });
  const result = decideCourseAction(demo2001, { status: CourseStatus.SELECTABLE }, context({
    running: true,
    courseStatuses: { DEMO1001: CourseStatus.SELECTABLE }
  }));
  assert.equal(result.allowed, true);
  assert.equal(result.action, "SELECT");
});

test("allows the FE demo target independently of the ME demo target", () => {
  const demo3001 = target({ courseCode: "DEMO3001", courseName: "Example Free Elective", section: "1002", category: "FE", dependsOn: null });
  const decision = decideCourseAction(demo3001, { status: CourseStatus.SELECTABLE }, context({ creditSummaries: { FE: { selected: 0, waiting: 0, assigned: 6 } } }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.action, "SELECT");
});

test("joins immediately without checking queue size or category credits", () => {
  const unknown = decideCourseAction(target(), { status: CourseStatus.WAITLIST_AVAILABLE }, context({ waitlistCount: null }));
  const large = decideCourseAction(target(), { status: CourseStatus.WAITLIST_AVAILABLE }, context({ waitlistCount: 6 }));
  const full = decideCourseAction(target(), { status: CourseStatus.WAITLIST_AVAILABLE }, context({ waitlistCount: 1, creditSummaries: { ME: { selected: 3, waiting: 3, assigned: 6 } } }));
  const noCredits = decideCourseAction(target(), { status: CourseStatus.WAITLIST_AVAILABLE }, context({ waitlistCount: null, creditSummaries: {} }));
  for (const result of [unknown, large, full, noCredits]) {
    assert.equal(result.action, "JOIN_WAITLIST");
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "waitlist-available-and-running");
  }
});

test("registered and unknown states never produce a click", () => {
  const registered = decideCourseAction(target(), { status: CourseStatus.REGISTERED }, context());
  const unknown = decideCourseAction(target(), { status: CourseStatus.UNKNOWN }, context());
  assert.equal(registered.action, "NONE");
  assert.equal(unknown.action, "NOTIFY");
  assert.equal(registered.allowed || unknown.allowed, false);
});
