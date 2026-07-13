import { normalizeText } from "./course_parser.js";

const ALLOWED_FUNCTIONS = Object.freeze({
  SELECT: new Set(["selectItem", "selectItemFromWaiting"]),
  JOIN_WAITLIST: new Set(["joinWaiting"])
});

const confirmationMatches = (message, target, actionType) => {
  const text = normalizeText(message).toLowerCase();
  const course = normalizeText(`${target.courseName} (${target.section})`).toLowerCase();
  if (!text.includes(course)) return false;
  if (actionType === "SELECT") return text.includes("select") && !text.includes("join waiting list");
  if (actionType === "JOIN_WAITLIST") return text.includes("join waiting list") || text.includes("加入轮候");
  return false;
};

const normalizedCourseName = (value) => normalizeText(value).replace(/\s*\(\d{4}\)\s*$/, "").toLowerCase();

export const executeGuardedDomAction = ({ row, target, actionType, pageWindow, click }) => {
  if (row.courseCode !== target.courseCode || row.section !== target.section) {
    return { ok: false, reason: "target-row-mismatch" };
  }
  const action = actionType === "SELECT" ? row.selectAction : row.joinWaitingAction;
  if (!action || !ALLOWED_FUNCTIONS[actionType]?.has(action.functionName)) {
    return { ok: false, reason: "forbidden-or-missing-action" };
  }
  if (!row.rowElement.contains(action.element)) {
    return { ok: false, reason: "detached-action-element" };
  }

  const nativeConfirm = pageWindow.confirm;
  let confirmationCount = 0;
  let mismatch = false;
  pageWindow.confirm = (message) => {
    confirmationCount += 1;
    const matches = confirmationMatches(message, target, actionType);
    mismatch = mismatch || !matches;
    return matches;
  };

  try {
    (click ?? ((element) => element.click()))(action.element);
    if (mismatch) return { ok: false, reason: "confirmation-text-mismatch" };
    if (confirmationCount === 0) return { ok: false, reason: "confirmation-not-observed" };
    if (confirmationCount !== 1) return { ok: false, reason: "unexpected-confirmation-count" };
    return { ok: true, reason: "confirmation-accepted" };
  } finally {
    pageWindow.confirm = nativeConfirm;
  }
};

export const executePageAction = ({ row, target, actionType, pageWindow }) => {
  if (row.courseCode !== target.courseCode
    || row.section !== target.section
    || normalizedCourseName(row.courseName) !== normalizedCourseName(target.courseName)) {
    return { ok: false, reason: "target-row-mismatch", functionName: null, confirmationObserved: false };
  }
  const action = actionType === "SELECT" ? row.selectAction : row.joinWaitingAction;
  const functionName = action?.functionName ?? null;
  if (!action || !ALLOWED_FUNCTIONS[actionType]?.has(functionName)) {
    return { ok: false, reason: "forbidden-or-missing-action", functionName, confirmationObserved: false };
  }
  if (!row.rowElement.contains(action.element)) {
    return { ok: false, reason: "detached-action-element", functionName, confirmationObserved: false };
  }
  const pageFunction = pageWindow[functionName];
  if (typeof pageFunction !== "function") {
    return { ok: false, reason: "page-function-unavailable", functionName, confirmationObserved: false };
  }

  const nativeConfirm = pageWindow.confirm;
  let confirmationCount = 0;
  let mismatch = false;
  pageWindow.confirm = (message) => {
    confirmationCount += 1;
    const matches = confirmationMatches(message, target, actionType);
    mismatch = mismatch || !matches;
    return matches;
  };
  try {
    try {
      Reflect.apply(pageFunction, pageWindow, [action.argument]);
    } catch {
      return { ok: false, reason: "page-function-threw", functionName, confirmationObserved: confirmationCount > 0 };
    }
    let reason = "confirmation-accepted";
    if (mismatch) reason = "confirmation-text-mismatch";
    else if (confirmationCount === 0) reason = "confirmation-not-observed";
    else if (confirmationCount !== 1) reason = "unexpected-confirmation-count";
    return {
      ok: reason === "confirmation-accepted",
      reason,
      functionName,
      confirmationObserved: confirmationCount > 0
    };
  } finally {
    pageWindow.confirm = nativeConfirm;
  }
};
