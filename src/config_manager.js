import { DEFAULT_SELECTION_WINDOWS, validateSelectionWindows } from "./time_scheduler.js";

const target = (courseCode, courseName, section, category) => ({
  id: `${courseCode}:${section}`,
  courseCode,
  courseName,
  section,
  category,
  allowDirectSelect: true,
  allowJoinWaitingList: true
});

const LEGACY_DEMO_TARGETS = [
  target("DEMO1001", "Example Major Elective", "1001", "ME"),
  target("DEMO2001", "Example Technology Course", "1001", "ME"),
  target("DEMO3001", "Example Free Elective", "1002", "FE")
];

const DEFAULT_TARGETS = [
  target("AI3133", "Natural Language Processing", "1001", "ME"),
  target("COMP4213", "Wireless Communication and Mobile Computing", "1001", "ME"),
  target("EBIS3113", "Business Forecasting and Machine Learning", "1002", "FE")
];

const cloneWindows = (windows) => windows.map(({ id, label, enabled, startText, endText }) => ({ id, label, enabled, startText, endText }));

export const createDefaultConfig = () => ({
  version: 3,
  actionSpacingMs: 1200,
  maxActionsPerMinute: 6,
  sameCourseCooldownMs: 8000,
  maxConsecutiveErrors: 3,
  actionLockTtlMs: 4000,
  controllerHeartbeatTimeoutMs: 15000,
  clockSyncIntervalMs: 300000,
  selectionWindows: cloneWindows(DEFAULT_SELECTION_WINDOWS),
  targets: DEFAULT_TARGETS.map((item) => ({ ...item }))
});

export const normalizeTarget = (input) => {
  const courseCode = String(input?.courseCode ?? "").trim().toUpperCase();
  const courseName = String(input?.courseName ?? "").replace(/\s+/g, " ").trim();
  const section = String(input?.section ?? "").trim();
  const category = String(input?.category ?? "").trim().toUpperCase();
  return {
    id: `${courseCode}:${section}`,
    courseCode,
    courseName,
    section,
    category,
    allowDirectSelect: input?.allowDirectSelect !== false,
    allowJoinWaitingList: input?.allowJoinWaitingList !== false
  };
};

const cleanWindows = (input) => cloneWindows(Array.isArray(input) ? input : DEFAULT_SELECTION_WINDOWS);

const cleanConfig = (input) => {
  const defaults = createDefaultConfig();
  const numeric = (key) => Number.isFinite(Number(input?.[key])) ? Number(input[key]) : defaults[key];
  return {
    version: 3,
    actionSpacingMs: numeric("actionSpacingMs"),
    maxActionsPerMinute: numeric("maxActionsPerMinute"),
    sameCourseCooldownMs: numeric("sameCourseCooldownMs"),
    maxConsecutiveErrors: numeric("maxConsecutiveErrors"),
    actionLockTtlMs: numeric("actionLockTtlMs"),
    controllerHeartbeatTimeoutMs: numeric("controllerHeartbeatTimeoutMs"),
    clockSyncIntervalMs: numeric("clockSyncIntervalMs"),
    selectionWindows: cleanWindows(input?.selectionWindows),
    targets: (Array.isArray(input?.targets) && input.targets.length ? input.targets : defaults.targets).map(normalizeTarget)
  };
};

const sameTargets = (left, right) => Array.isArray(left)
  && left.length === right.length
  && left.every((item, index) => {
    const normalized = normalizeTarget(item);
    const expected = normalizeTarget(right[index]);
    return normalized.courseCode === expected.courseCode
      && normalized.courseName === expected.courseName
      && normalized.section === expected.section
      && normalized.category === expected.category;
  });

export const migrateConfig = (input) => cleanConfig(sameTargets(input?.targets, LEGACY_DEMO_TARGETS)
  ? { ...input, targets: DEFAULT_TARGETS }
  : input);

export const validateConfig = (config) => {
  const errors = [];
  if (!config || typeof config !== "object") return { valid: false, errors: ["config-must-be-an-object"] };
  if (config.version !== 3) errors.push("unsupported-config-version");
  if (!Array.isArray(config.targets) || config.targets.length === 0) errors.push("targets-required");
  const keys = new Set();
  for (const raw of config.targets ?? []) {
    const item = normalizeTarget(raw);
    if (!/^[A-Z0-9]+$/.test(item.courseCode)) errors.push(`invalid-course-code:${item.courseCode}`);
    if (!item.courseName) errors.push(`invalid-course-name:${item.id}`);
    if (!/^\d{4}$/.test(item.section)) errors.push(`invalid-section:${item.id}`);
    if (!["ME", "FE"].includes(item.category)) errors.push(`invalid-category:${item.id}`);
    if (keys.has(item.id)) errors.push(`duplicate-target:${item.id}`);
    keys.add(item.id);
  }
  const windows = validateSelectionWindows(config.selectionWindows);
  errors.push(...windows.errors);
  if (!Number.isFinite(config.clockSyncIntervalMs) || config.clockSyncIntervalMs < 60000) errors.push("clock-sync-interval-invalid");
  return { valid: errors.length === 0, errors };
};

export const saveableConfig = (config) => cleanConfig(config);
