import { CourseStatus } from "./course_parser.js";

const decision = (target, action, allowed, reason, requiresConfirmation = false) => ({
  action,
  allowed,
  reason,
  courseCode: target.courseCode,
  requiresConfirmation
});

const automationGate = (target, action, context) => {
  if (!context.running) return decision(target, action, false, "test-only", true);
  return null;
};

export const decideCourseAction = (target, row, context) => {
  if (!row) return decision(target, "NOTIFY", false, "course-not-uniquely-matched");
  if (row.status === CourseStatus.REGISTERED) return decision(target, "NONE", false, "already-registered");
  if (row.status === CourseStatus.UNKNOWN) return decision(target, "NOTIFY", false, "unknown-course-state");
  if (row.status === CourseStatus.TIME_CONFLICT) return decision(target, "NOTIFY", false, "time-conflict");
  if (row.status === CourseStatus.WAITING) return decision(target, "NONE", false, "already-waiting");

  if (row.status === CourseStatus.SELECTABLE) {
    if (!target.allowDirectSelect) return decision(target, "NOTIFY", false, "direct-select-disabled");
    return automationGate(target, "SELECT", context)
      ?? decision(target, "SELECT", true, "selectable-and-running");
  }

  if (row.status === CourseStatus.WAITLIST_AVAILABLE) {
    if (!target.allowJoinWaitingList) return decision(target, "NOTIFY", false, "waitlist-disabled");
    return automationGate(target, "JOIN_WAITLIST", context)
      ?? decision(target, "JOIN_WAITLIST", true, "waitlist-available-and-running");
  }

  return decision(target, "NOTIFY", false, `unsupported-state:${row.status}`);
};
