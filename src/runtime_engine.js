import { findUniqueCourse } from "./course_parser.js";
import { decideCourseAction } from "./decision_engine.js";

const actionWasVerified = (pending, status) => pending.action === "SELECT"
  ? status === "REGISTERED"
  : ["WAITING", "REGISTERED"].includes(status);

export const reconcilePendingActions = (pendingActions = {}, courseStatuses = {}, now = Date.now()) => {
  const next = {};
  const verified = [];
  const failed = [];
  const blockedCourses = new Set();
  let stopReason = null;

  for (const [courseCode, pending] of Object.entries(pendingActions)) {
    if (actionWasVerified(pending, courseStatuses[courseCode])) {
      verified.push({ courseCode, action: pending.action, status: courseStatuses[courseCode] });
      continue;
    }
    if (pending.stage === "READY") {
      next[courseCode] = pending;
      continue;
    }
    if (pending.retryAt && now >= pending.retryAt) {
      next[courseCode] = { ...pending, stage: "READY" };
      continue;
    }
    if (now < pending.verifyAt || (pending.retryAt && now < pending.retryAt)) {
      next[courseCode] = pending;
      blockedCourses.add(courseCode);
      continue;
    }
    const failureCount = (pending.failureCount ?? 0) + 1;
    failed.push({ courseCode, action: pending.action, failureCount });
    if (failureCount >= 3) {
      stopReason = `action-verification-failed:${courseCode}`;
      continue;
    }
    const backoffMs = failureCount === 1 ? 15000 : 30000;
    next[courseCode] = {
      ...pending,
      failureCount,
      stage: "BACKOFF",
      retryAt: now + backoffMs
    };
    blockedCourses.add(courseCode);
  }

  return { pendingActions: next, verified, failed, blockedCourses, stopReason };
};

export const planCourseScan = ({ targets, rows, context }) => {
  const courseStatuses = { ...(context.courseStatuses ?? {}) };
  const matchedRows = new Map();
  for (const target of targets) {
    const matched = findUniqueCourse(rows, target);
    if (matched) {
      matchedRows.set(`${target.courseCode}:${target.section}`, matched);
      courseStatuses[target.courseCode] = matched.status;
    }
  }

  const evaluations = [];
  for (const target of targets) {
    const key = `${target.courseCode}:${target.section}`;
    const row = matchedRows.get(key);
    if (!row) continue;
    const decision = decideCourseAction(target, row, {
      ...context,
      courseStatuses,
      waitlistCount: context.waitlistCounts?.[key] ?? null
    });
    evaluations.push({ target, row, decision });
  }

  return {
    courseStatuses,
    evaluations,
    candidates: evaluations.filter((evaluation) => evaluation.decision.allowed),
    next: evaluations.find((evaluation) => evaluation.decision.allowed) ?? null
  };
};
