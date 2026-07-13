import { evaluateSchedule, validateSelectionWindows } from "./time_scheduler.js";

const localClock = () => ({
  source: "LOCAL",
  offsetMs: 0,
  rttMs: null,
  uncertaintyMs: null,
  syncedAt: null,
  error: "not-synced"
});

const executableState = () => ({
  actionQueue: [],
  actionLock: null,
  pendingActions: {}
});

export const createRuntimeStateV3 = (now = Date.now()) => ({
  version: 3,
  updatedAt: now,
  mode: "STOPPED",
  running: false,
  scheduleEnabled: false,
  selectionWindows: [],
  activeWindowId: null,
  nextTransitionAt: null,
  clockSync: localClock(),
  pollPhase: "STOPPED",
  nextReloadAt: null,
  targets: [],
  courseStatuses: {},
  workers: {},
  actionQueue: [],
  actionLock: null,
  lastActionAt: null,
  pendingActions: {},
  lastError: null
});

export const createRuntimeControlV3 = (now = Date.now()) => ({
  version: 3,
  updatedAt: now,
  generation: 0,
  mode: "STOPPED",
  running: false,
  scheduleEnabled: false,
  selectionWindows: [],
  activeWindowId: null,
  nextTransitionAt: null,
  clockSync: localClock(),
  pollPhase: "STOPPED",
  lastError: null
});

export const applyRuntimeControl = (state, control) => {
  const controlled = {
    ...state,
    mode: control?.mode ?? "STOPPED",
    running: Boolean(control?.running),
    scheduleEnabled: Boolean(control?.scheduleEnabled),
    selectionWindows: Array.isArray(control?.selectionWindows) ? control.selectionWindows : [],
    activeWindowId: control?.activeWindowId ?? null,
    nextTransitionAt: control?.nextTransitionAt ?? null,
    clockSync: control?.clockSync ?? state.clockSync ?? localClock(),
    pollPhase: control?.pollPhase ?? "STOPPED",
    lastError: control?.lastError ?? null
  };
  if (controlled.running) return controlled;
  return { ...controlled, ...executableState(), nextReloadAt: null };
};

export const recordPendingAction = (pendingActions, targetId, actionType, submittedAt = Date.now()) => ({
  ...pendingActions,
  [targetId]: { actionType, submittedAt, verifyAfter: submittedAt + 15000 }
});

export const reconcilePendingActionsV3 = (pendingActions = {}, observedStatuses = {}, now = Date.now()) => {
  const next = {};
  const blocked = new Set();
  const verified = [];
  const failed = [];
  for (const [targetId, pending] of Object.entries(pendingActions)) {
    const status = observedStatuses[targetId];
    const success = pending.actionType === "SELECT"
      ? status === "REGISTERED"
      : ["WAITING", "REGISTERED"].includes(status);
    if (success) {
      verified.push({ targetId, actionType: pending.actionType, status });
      continue;
    }
    if (status === undefined || now < pending.verifyAfter) {
      next[targetId] = pending;
      blocked.add(targetId);
      continue;
    }
    failed.push({ targetId, actionType: pending.actionType, status });
  }
  return { pendingActions: next, blocked, verified, failed };
};

export const startManualRuntime = (state, now = Date.now()) => ({
  ...state,
  ...executableState(),
  version: 3,
  updatedAt: now,
  mode: "MANUAL",
  running: true,
  scheduleEnabled: false,
  activeWindowId: null,
  nextTransitionAt: null,
  pollPhase: "FAST",
  nextReloadAt: null,
  lastError: null
});

export const scheduleRuntime = (state, windows, now = Date.now()) => {
  const validation = validateSelectionWindows(windows);
  if (!validation.valid) throw new Error(validation.errors.join(","));
  const schedule = evaluateSchedule(validation.windows, now);
  if (schedule.complete) return stopRuntime(state, now);
  return {
    ...state,
    ...executableState(),
    version: 3,
    updatedAt: now,
    mode: "SCHEDULED",
    running: Boolean(schedule.activeWindow),
    scheduleEnabled: true,
    selectionWindows: validation.windows,
    activeWindowId: schedule.activeWindow?.id ?? null,
    nextTransitionAt: schedule.nextTransitionAt,
    pollPhase: schedule.phase,
    nextReloadAt: null,
    lastError: null
  };
};

export const applyScheduleTick = (state, now = Date.now()) => {
  if (state.mode !== "SCHEDULED" || !state.scheduleEnabled) return state;
  const schedule = evaluateSchedule(state.selectionWindows, now);
  if (schedule.complete) return stopRuntime(state, now);
  const running = Boolean(schedule.activeWindow);
  return {
    ...state,
    ...(running ? {} : executableState()),
    updatedAt: now,
    running,
    activeWindowId: schedule.activeWindow?.id ?? null,
    nextTransitionAt: schedule.nextTransitionAt,
    pollPhase: schedule.phase,
    nextReloadAt: null
  };
};

export const stopRuntime = (state, now = Date.now(), error = null) => ({
  ...state,
  ...executableState(),
  version: 3,
  updatedAt: now,
  mode: "STOPPED",
  running: false,
  scheduleEnabled: false,
  activeWindowId: null,
  nextTransitionAt: null,
  pollPhase: "STOPPED",
  nextReloadAt: null,
  lastError: error
});

export const recordWorker = (state, category, workerId, now = Date.now()) => ({
  ...state,
  updatedAt: now,
  workers: { ...state.workers, [category]: { workerId, at: now } }
});

export const workerIsHealthy = (state, category, now = Date.now(), timeoutMs = 15000) => {
  const worker = state.workers?.[category];
  return Boolean(worker && now - worker.at <= timeoutMs);
};
