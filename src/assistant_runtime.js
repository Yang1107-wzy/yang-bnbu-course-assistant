import { actionSignatureMatches, claimNextAction, enqueueCandidates, finishAction, releaseAction } from "./action_queue.js";
import { executePageAction } from "./action_executor.js";
import { createKeyValueStorage } from "./browser_storage.js";
import { clockSyncIsFresh, correctedNow, syncServerClock } from "./clock_sync.js";
import { createDefaultConfig, migrateConfig, saveableConfig, validateConfig } from "./config_manager.js";
import { detectPageType, findCategoryDetailLinks } from "./course_page_adapter.js";
import { detectSessionExpired, findUniqueCourse, parseCourseRows } from "./course_parser.js";
import { AuditLogger } from "./logger.js";
import { planCourseScan } from "./runtime_engine.js";
import {
  applyRuntimeControl,
  applyScheduleTick,
  createRuntimeControlV3,
  createRuntimeStateV3,
  reconcilePendingActionsV3,
  recordPendingAction,
  scheduleRuntime,
  startManualRuntime,
  stopRuntime
} from "./runtime_state.js";
import {
  allTargetsRegistered,
  evaluateSchedule,
  formatBeijingDateTime,
  pollPhaseFor,
  randomPollDelayMs
} from "./time_scheduler.js";
import { createPanel, createWorkerStatusBar, PANEL_CSS } from "./ui_panel.js";
import {
  buildWorkerAssignments,
  claimWorkerSlot,
  createWorkerUrl,
  heartbeatWorkerSlot,
  parseWorkerMarker,
  reserveWorkerOpening,
  workerSlotIsHealthy
} from "./worker_pool.js";

export const CONFIG_KEY_V2 = "bnbu.courseAssistant.config.v2";
export const STATE_KEY_V3 = "bnbu.courseAssistant.state.v3";
export const CONFIG_KEY_V3 = "bnbu.courseAssistant.config.v3";
export const CONTROL_KEY_V3 = "bnbu.courseAssistant.control.v3";
export const PANEL_LAYOUT_KEY = "bnbu.courseAssistant.panelLayout.v1";
export const WORKER_POOL_KEY = "bnbu.courseAssistant.workerPool.v1";
export const MIGRATION_KEY_V12 = "bnbu.courseAssistant.migration.v1.2.0";
const LOG_KEY_V3 = "bnbu.courseAssistant.logs.v3";
const WORKER_ID_KEY_V3 = "bnbu.courseAssistant.workerId.v3";
export const WORKER_SESSION_KEY = "bnbu.courseAssistant.workerAssignment.v1";

const delay = (pageWindow, ms) => new Promise((resolve) => pageWindow.setTimeout(resolve, ms));
const randomId = (pageWindow) => pageWindow.crypto?.randomUUID?.()
  ?? `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const buildStorage = (key, gm, fallback) => createKeyValueStorage(key, {
  getValue: gm.getValue,
  setValue: gm.setValue,
  deleteValue: gm.deleteValue,
  addValueChangeListener: gm.addValueChangeListener
}, fallback);

const withBrowserLock = (pageWindow, name, operation) => {
  const locks = pageWindow.navigator?.locks;
  return typeof locks?.request === "function"
    ? locks.request(name, { mode: "exclusive" }, operation)
    : operation();
};

const actionReadiness = (action, pageWindow) => action
  ? `${action.functionName} ${typeof pageWindow[action.functionName] === "function" ? "READY" : "不可用"}`
  : "入口不可用";

const displayReason = (row, reason, pageWindow) => {
  if (row.status === "SELECTABLE") return `可直接选 · ${actionReadiness(row.selectAction, pageWindow)}`;
  if (row.status === "WAITLIST_AVAILABLE") {
    const label = reason === "test-only" ? "可加入轮候；启动后自动执行" : "正在自动加入轮候";
    return `${label} · ${actionReadiness(row.joinWaitingAction, pageWindow)}`;
  }
  if (row.status === "WAITING") return "已加入轮候";
  if (row.status === "REGISTERED") return "已抢到";
  if (row.status === "TIME_CONFLICT") return "时间冲突";
  return reason ?? "不可选";
};

const secureRandom = (pageWindow) => {
  try {
    const values = new Uint32Array(1);
    pageWindow.crypto.getRandomValues(values);
    return values[0] / 0xffffffff;
  } catch {
    return Math.random();
  }
};

const durationText = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (days) return `${days}天 ${hours}小时`;
  if (hours) return `${hours}小时 ${minutes}分`;
  if (minutes) return `${minutes}分 ${remainder}秒`;
  return `${remainder}秒`;
};

const pollPhaseText = (phase) => ({
  NORMAL: "NORMAL · 3 秒",
  BURST: "BURST · 1 秒",
  PAUSED: "PAUSED · 等待提交结果",
  COMPLETE: "COMPLETE",
  STOPPED: "STOPPED"
}[phase] ?? phase ?? "STOPPED");

export const createAssistantRuntime = async ({
  pageWindow,
  gm,
  autoTimers = true,
  tabId,
  now = Date.now,
  random,
  fetchFn
}) => {
  const document = pageWindow.document;
  const pageType = detectPageType(pageWindow.location);
  const randomSource = random ?? (() => secureRandom(pageWindow));
  const clockFetch = fetchFn ?? (typeof pageWindow.fetch === "function" ? pageWindow.fetch.bind(pageWindow) : async () => { throw new Error("fetch-unavailable"); });
  const configStorage = buildStorage(CONFIG_KEY_V3, gm, null);
  const legacyConfigStorage = buildStorage(CONFIG_KEY_V2, gm, null);
  const stateStorage = buildStorage(STATE_KEY_V3, gm, null);
  const controlStorage = buildStorage(CONTROL_KEY_V3, gm, null);
  const panelLayoutStorage = buildStorage(PANEL_LAYOUT_KEY, gm, null);
  const workerPoolStorage = buildStorage(WORKER_POOL_KEY, gm, {});
  const migrationStorage = buildStorage(MIGRATION_KEY_V12, gm, false);
  const logStorage = buildStorage(LOG_KEY_V3, gm, []);
  const logger = new AuditLogger(logStorage, 300);
  let panelLayout = await panelLayoutStorage.get();

  const storedConfig = await configStorage.get();
  const legacyConfig = storedConfig ? null : await legacyConfigStorage.get();
  let config = migrateConfig(storedConfig ?? legacyConfig ?? createDefaultConfig());
  if (!validateConfig(config).valid) config = createDefaultConfig();

  const firstV12Run = await migrationStorage.get() !== true;
  if (firstV12Run) {
    config = {
      ...config,
      actionSpacingMs: 250,
      maxWorkers: 6,
      controllerHeartbeatTimeoutMs: 60000
    };
    await workerPoolStorage.set({});
    await migrationStorage.set(true);
  }

  let state = await stateStorage.get();
  if (state?.version !== 3) state = createRuntimeStateV3(now());
  let control = await controlStorage.get();
  if (control?.version !== 3) {
    control = { ...createRuntimeControlV3(now()), selectionWindows: config.selectionWindows };
  }
  if (firstV12Run) {
    state = stopRuntime(state, now());
    control = { ...createRuntimeControlV3(now()), selectionWindows: config.selectionWindows };
  }
  state = applyRuntimeControl({ ...state, version: 3, targets: config.targets, selectionWindows: control.selectionWindows }, control);
  await configStorage.set(config);
  await controlStorage.set(control);
  await stateStorage.set(state);

  let workerId = tabId;
  if (!workerId) {
    workerId = pageWindow.sessionStorage.getItem(WORKER_ID_KEY_V3) ?? randomId(pageWindow);
    pageWindow.sessionStorage.setItem(WORKER_ID_KEY_V3, workerId);
  }
  const urlWorkerMarker = parseWorkerMarker(pageWindow.location);
  let savedWorkerAssignment = null;
  try {
    savedWorkerAssignment = JSON.parse(pageWindow.sessionStorage.getItem(WORKER_SESSION_KEY) ?? "null");
  } catch {
    pageWindow.sessionStorage.removeItem(WORKER_SESSION_KEY);
  }
  if (urlWorkerMarker) {
    savedWorkerAssignment = { marker: urlWorkerMarker, detailUrl: pageWindow.location.href };
    pageWindow.sessionStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(savedWorkerAssignment));
  }
  const workerMarker = urlWorkerMarker ?? savedWorkerAssignment?.marker ?? null;
  const workerDetailUrl = savedWorkerAssignment?.detailUrl ?? null;
  const isController = pageType === "OVERVIEW" && !workerMarker;
  const workerSlot = workerMarker ? {
    slotId: workerMarker.slotId,
    category: workerMarker.category,
    targetIds: workerMarker.targetIds
  } : null;
  let workerActive = false;

  let panel = null;
  let workerPanel = null;
  let scanRunning = false;
  let reloadTimer = null;
  let heartbeatTimer = null;
  let uiTimer = null;
  let layoutSaveTimer = null;
  let actionAttemptTimer = null;
  let mutationObserver = null;
  let returnToDetailTimer = null;
  let message = "点击 Test 检查，或选择立即/预约启动";

  const readState = async () => {
    state = await stateStorage.get();
    if (state?.version !== 3) state = createRuntimeStateV3(now());
    control = await controlStorage.get();
    if (control?.version !== 3) control = { ...createRuntimeControlV3(now()), selectionWindows: config.selectionWindows };
    state = applyRuntimeControl(state, control);
    return state;
  };

  const writeState = async (next) => {
    control = await controlStorage.get();
    if (control?.version !== 3) control = { ...createRuntimeControlV3(now()), selectionWindows: config.selectionWindows };
    state = applyRuntimeControl({ ...next, version: 3, updatedAt: now() }, control);
    await stateStorage.set(state);
    return state;
  };

  const publishControlState = async (next) => {
    const previous = await controlStorage.get();
    control = {
      ...createRuntimeControlV3(now()),
      generation: (previous?.generation ?? 0) + 1,
      mode: next.mode,
      running: Boolean(next.running),
      scheduleEnabled: Boolean(next.scheduleEnabled),
      selectionWindows: next.selectionWindows?.length ? next.selectionWindows : config.selectionWindows,
      activeWindowId: next.activeWindowId ?? null,
      nextTransitionAt: next.nextTransitionAt ?? null,
      clockSync: next.clockSync,
      pollPhase: next.pollPhase,
      lastError: next.lastError ?? null
    };
    await controlStorage.set(control);
    state = applyRuntimeControl({ ...next, version: 3, updatedAt: now() }, control);
    await stateStorage.set(state);
    return state;
  };

  const log = (entry) => logger.append({
    timestamp: new Date(now()).toISOString(),
    mode: state.mode,
    pageUrl: pageWindow.location.href,
    ...entry
  });
  const notify = (title, text) => {
    try { gm.notification?.({ title, text, timeout: 7000 }); } catch { /* optional */ }
  };

  const correctedCurrentTime = (current) => correctedNow(now(), current.clockSync);
  const workerAssignments = () => buildWorkerAssignments(config.targets, config.maxWorkers);
  const assignedTargets = () => {
    if (!workerSlot || !workerActive) return [];
    const ids = new Set(workerSlot.targetIds);
    return config.targets.filter((target) => ids.has(target.id) && target.category === workerSlot.category);
  };

  const readWorkerPool = async () => await workerPoolStorage.get() ?? {};
  const writeWorkerPool = async (registry) => {
    await workerPoolStorage.set(registry);
    return registry;
  };

  const claimCurrentWorkerUnlocked = async () => {
    if (!workerSlot || !workerMarker) return false;
    const validAssignment = workerAssignments().find((slot) => slot.slotId === workerSlot.slotId
      && slot.category === workerSlot.category
      && slot.targetIds.join(",") === workerSlot.targetIds.join(","));
    if (!validAssignment) return false;
    const claim = claimWorkerSlot(
      await readWorkerPool(),
      workerSlot,
      workerId,
      workerMarker.openingToken,
      now(),
      config.controllerHeartbeatTimeoutMs
    );
    if (!claim.claimed) return false;
    await writeWorkerPool(claim.registry);
    const verified = await readWorkerPool();
    return verified[workerSlot.slotId]?.ownerId === workerId;
  };
  const claimCurrentWorker = () => withBrowserLock(pageWindow, "yang-worker-pool-v1", claimCurrentWorkerUnlocked);

  const heartbeatCurrentWorkerUnlocked = async (lastScanAt) => {
    if (!workerActive || !workerSlot) return false;
    const heartbeat = heartbeatWorkerSlot(await readWorkerPool(), workerSlot.slotId, workerId, now(), lastScanAt);
    if (!heartbeat.updated) {
      workerActive = false;
      clearReload();
      return false;
    }
    await writeWorkerPool(heartbeat.registry);
    return true;
  };
  const heartbeatCurrentWorker = (lastScanAt) => withBrowserLock(
    pageWindow,
    "yang-worker-pool-v1",
    () => heartbeatCurrentWorkerUnlocked(lastScanAt)
  );

  const updatePanel = async () => {
    const current = await readState();
    const workerPool = await readWorkerPool();
    const beijingNow = correctedCurrentTime(current);
    const schedule = evaluateSchedule(current.selectionWindows?.length ? current.selectionWindows : config.selectionWindows, beijingNow);
    const sync = current.clockSync;
    const syncText = sync?.source === "BNBU_SERVER"
      ? `BNBU SERVER · ${sync.offsetMs >= 0 ? "+" : ""}${sync.offsetMs}ms · ±${sync.uncertaintyMs}ms`
      : `本机时钟${sync?.error ? ` · ${sync.error}` : ""}`;
    const nextWindowText = current.mode === "MANUAL"
      ? "手动即时运行"
      : schedule.activeWindow
        ? `${schedule.activeWindow.label}进行中 · 剩余 ${durationText(schedule.activeWindow.endAt - beijingNow)}`
        : schedule.nextWindow
          ? `${schedule.nextWindow.label} · ${durationText(schedule.nextWindow.startAt - beijingNow)}`
          : "没有后续窗口";
    const courseStatuses = { ...current.courseStatuses };
    for (const slot of workerAssignments()) {
      const poolEntry = workerPool[slot.slotId];
      const healthy = workerSlotIsHealthy(workerPool, slot.slotId, now(), config.controllerHeartbeatTimeoutMs);
      for (const id of slot.targetIds) {
        const previous = courseStatuses[id];
        if (["REGISTERED", "WAITING", "SUBMITTING", "FAILED"].includes(previous?.status)) {
          courseStatuses[id] = { ...previous, workerSlotId: slot.slotId };
        } else if (poolEntry?.phase === "OPENING" && poolEntry.openingUntil > now()) {
          courseStatuses[id] = { ...previous, status: "OPENING", reason: "正在打开 Worker", workerSlotId: slot.slotId };
        } else if (!healthy && current.mode !== "STOPPED") {
          courseStatuses[id] = { ...previous, status: "WORKER_OFFLINE", reason: "Worker 失联，等待恢复", workerSlotId: slot.slotId };
        } else if (previous) {
          courseStatuses[id] = { ...previous, workerSlotId: slot.slotId };
        }
      }
    }
    const view = {
      mode: current.mode,
      running: current.running,
      error: Boolean(current.lastError),
      beijingNowText: formatBeijingDateTime(beijingNow).replace("T", " "),
      clockSyncText: syncText,
      nextWindowText,
      pollPhaseText: pollPhaseText(current.pollPhase),
      message: current.lastError ?? message,
      courseStatuses
    };
    panel?.update(view);
    workerPanel?.update(view);
  };

  const localCategoryFromRows = (rows) => rows.find((row) => ["ME", "FE"].includes(row.category))?.category ?? null;

  const ensureWorkersUnlocked = async () => {
    if (!isController) return;
    const links = findCategoryDetailLinks(document, pageWindow.location);
    for (const slot of workerAssignments()) {
      if (!links[slot.category]) continue;
      const openingToken = randomId(pageWindow);
      const reservation = reserveWorkerOpening(
        await readWorkerPool(),
        slot,
        openingToken,
        now(),
        30000,
        config.controllerHeartbeatTimeoutMs
      );
      if (!reservation.reserved) continue;
      await writeWorkerPool(reservation.registry);
      const verified = await readWorkerPool();
      if (verified[slot.slotId]?.openingToken !== openingToken) continue;
      gm.openInTab?.(createWorkerUrl(links[slot.category], slot, openingToken), { active: false, insert: true, setParent: true });
    }
    await updatePanel();
  };
  const ensureWorkers = () => withBrowserLock(pageWindow, "yang-worker-pool-v1", ensureWorkersUnlocked);

  const syncClock = async (force = false) => {
    let current = await readState();
    const age = now() - (current.clockSync?.syncedAt ?? 0);
    if (!force && current.clockSync?.syncedAt && age >= 0 && age < config.clockSyncIntervalMs) return current.clockSync;
    const url = new URL("/mis/student/es/elective.do", pageWindow.location.origin).href;
    const clockSync = await syncServerClock({ fetchFn: clockFetch, url, now });
    current = { ...current, clockSync };
    await publishControlState(current);
    await updatePanel();
    return clockSync;
  };

  const executeNextInternal = async (evaluations) => {
    if (!workerActive) return null;
    let current = await readState();
    if (!current.running) return null;
    const claim = claimNextAction(current, workerId, now(), config.actionSpacingMs);
    if (!claim.claimed) return null;
    await writeState(claim.state);
    await delay(pageWindow, 50);
    current = await readState();
    if (current.actionLock?.ownerId !== workerId || current.actionLock?.key !== claim.claimed.key) return null;
    const evaluation = evaluations.find((item) => item.target.id === claim.claimed.targetId
      && item.decision.action === claim.claimed.actionType);
    if (!evaluation || !actionSignatureMatches(claim.claimed, evaluation)) {
      await writeState(releaseAction(current, claim.claimed.key));
      return null;
    }

    const targetId = evaluation.target.id;
    const prepared = finishAction(current, claim.claimed.key, now());
    prepared.pendingActions = recordPendingAction(prepared.pendingActions, targetId, evaluation.decision.action, now());
    prepared.courseStatuses = {
      ...prepared.courseStatuses,
      [targetId]: {
        ...prepared.courseStatuses[targetId],
        status: "SUBMITTING",
        reason: evaluation.decision.action === "JOIN_WAITLIST" ? "正在提交 Join Waiting" : "正在提交 Select",
        actionType: evaluation.decision.action,
        attempts: (prepared.courseStatuses[targetId]?.attempts ?? 0) + 1,
        workerSlotId: workerSlot.slotId,
        scannedAt: formatBeijingDateTime(correctedCurrentTime(prepared)).slice(11)
      }
    };
    const committed = await writeState(prepared);
    if (!committed.running) return null;
    const result = executePageAction({ row: evaluation.row, target: evaluation.target, actionType: evaluation.decision.action, pageWindow });
    if (!result.ok) {
      const failed = await readState();
      const pendingActions = { ...failed.pendingActions };
      delete pendingActions[targetId];
      failed.pendingActions = pendingActions;
      failed.courseStatuses = {
        ...failed.courseStatuses,
        [targetId]: {
          ...failed.courseStatuses[targetId],
          status: "FAILED",
          reason: result.reason,
          actionType: evaluation.decision.action,
          workerSlotId: workerSlot.slotId,
          retryAt: (failed.courseStatuses[targetId]?.attempts ?? 1) >= 3 ? null : now() + 3000,
          scannedAt: formatBeijingDateTime(correctedCurrentTime(failed)).slice(11)
        }
      };
      await writeState(failed);
      await log({ level: "error", event: "action-rejected", courseCode: evaluation.target.courseCode, action: evaluation.decision.action, reason: result.reason });
      notify("MIS 课程动作失败", `${evaluation.target.courseCode}: ${result.reason}`);
      await updatePanel();
      return result;
    }
    await log({ level: "info", event: "action-submitted", courseCode: evaluation.target.courseCode, action: evaluation.decision.action, reason: result.reason });
    notify("MIS 已提交选课动作", `${evaluation.target.courseCode} ${evaluation.decision.action}`);
    return result;
  };
  const executeNext = (evaluations) => withBrowserLock(
    pageWindow,
    "yang-runtime-state-v1",
    () => executeNextInternal(evaluations)
  );

  const scheduleActionAttempt = (evaluations) => {
    if (!autoTimers || !workerActive || actionAttemptTimer) return;
    actionAttemptTimer = pageWindow.setTimeout(async () => {
      actionAttemptTimer = null;
      const current = await readState();
      if (!current.running) return;
      const result = await executeNext(evaluations);
      if (!result && current.actionQueue?.some((item) => item.workerId === workerId)) scheduleActionAttempt(evaluations);
    }, 50);
  };

  const scanInternal = async ({ allowActions = false } = {}) => {
    if (scanRunning) return { skipped: true, reason: "scan-running" };
    if (!workerActive) return { skipped: true, reason: isController ? "controller-page" : "inactive-worker" };
    scanRunning = true;
    try {
      if (detectSessionExpired(document)) {
        const failed = stopRuntime(await readState(), now(), "登录已失效");
        await publishControlState(failed);
        notify("MIS 自动选课已停止", "登录已失效，请重新登录");
        return { stopped: true, reason: "session-expired" };
      }
      const rows = parseCourseRows(document);
      const category = localCategoryFromRows(rows);
      let current = await readState();
      const targets = assignedTargets();
      if (pageType === "DETAIL" && category && category !== workerSlot.category) {
        workerActive = false;
        clearReload();
        return { stopped: true, reason: "worker-category-mismatch" };
      }
      const plan = planCourseScan({
        targets,
        rows,
        context: { running: Boolean(current.running && allowActions), courseStatuses: {} }
      });

      const observedStatuses = {};
      for (const target of targets) {
        const row = findUniqueCourse(rows, target);
        if (row) observedStatuses[target.id] = row.status;
        else if (category && target.category === category) observedStatuses[target.id] = "NOT_FOUND";
      }
      const pending = reconcilePendingActionsV3(current.pendingActions, observedStatuses, now());
      current.pendingActions = pending.pendingActions;
      const pendingFailures = new Map(pending.failed.map((failure) => [failure.targetId, failure]));

      const scannedAt = formatBeijingDateTime(correctedCurrentTime(current)).slice(11);
      const statuses = { ...current.courseStatuses };
      for (const target of targets) {
        const row = findUniqueCourse(rows, target);
        const previous = statuses[target.id];
        const verificationFailure = pendingFailures.get(target.id);
        const failureBlocked = previous?.status === "FAILED"
          && (previous.attempts >= 3 || (Number.isFinite(previous.retryAt) && previous.retryAt > now()));
        if (verificationFailure) {
          const attempts = previous?.attempts ?? 1;
          statuses[target.id] = {
            ...previous,
            status: "FAILED",
            reason: "提交后未观察到 Selected/Waiting",
            actionType: verificationFailure.actionType,
            retryAt: attempts >= 3 ? null : now() + (attempts === 1 ? 15000 : 30000),
            workerSlotId: workerSlot.slotId,
            scannedAt
          };
        } else if (failureBlocked) {
          statuses[target.id] = { ...previous, workerSlotId: workerSlot.slotId, scannedAt };
        } else if (pending.blocked.has(target.id)) {
          statuses[target.id] = {
            ...statuses[target.id],
            status: "SUBMITTING",
            reason: "等待页面确认结果",
            workerSlotId: workerSlot.slotId,
            scannedAt
          };
        } else if (row) {
          const evaluation = plan.evaluations.find((item) => item.target.id === target.id);
          statuses[target.id] = {
            ...statuses[target.id],
            status: row.status,
            reason: displayReason(row, evaluation?.decision.reason, pageWindow),
            workerSlotId: workerSlot.slotId,
            scannedAt
          };
        } else if (category && target.category === category) {
          statuses[target.id] = {
            ...statuses[target.id],
            status: "NOT_FOUND",
            reason: "当前页面未找到",
            workerSlotId: workerSlot.slotId,
            scannedAt
          };
        }
      }
      current = { ...current, courseStatuses: statuses, targets: config.targets, lastError: null };

      if (allTargetsRegistered(config.targets, statuses)) {
        message = "所有目标课程已选中，自动停止";
        await publishControlState(stopRuntime(current, now()));
        await updatePanel();
        return plan;
      }

      if (current.running && allowActions) {
        const candidates = plan.candidates.filter((candidate) => {
          if (pending.blocked.has(candidate.target.id) || pendingFailures.has(candidate.target.id)) return false;
          const status = statuses[candidate.target.id];
          return !(status?.status === "FAILED"
            && (status.attempts >= 3 || (Number.isFinite(status.retryAt) && status.retryAt > now())));
        });
        current.actionQueue = enqueueCandidates(current.actionQueue, candidates, workerId, now());
      }
      await writeState(current);
      await heartbeatCurrentWorker(now());
      if (current.running && allowActions) {
        const result = await executeNextInternal(plan.evaluations);
        if (!result && current.actionQueue?.some((item) => item.workerId === workerId)) scheduleActionAttempt(plan.evaluations);
      }
      message = `已扫描 ${rows.length} 条课程行`;
      await log({ level: "info", event: "scan", reason: message });
      await updatePanel();
      if (autoTimers && pageType === "OVERVIEW" && workerDetailUrl && workerActive) {
        if (returnToDetailTimer) pageWindow.clearTimeout(returnToDetailTimer);
        returnToDetailTimer = pageWindow.setTimeout(() => {
          returnToDetailTimer = null;
          pageWindow.location.replace(workerDetailUrl);
        }, 250);
      }
      return plan;
    } finally {
      scanRunning = false;
    }
  };
  const scan = (options = {}) => withBrowserLock(
    pageWindow,
    "yang-runtime-state-v1",
    () => scanInternal(options)
  );

  const clearReload = () => {
    if (reloadTimer) pageWindow.clearTimeout(reloadTimer);
    reloadTimer = null;
  };

  const scheduleReload = async () => {
    clearReload();
    if (!autoTimers || pageType !== "DETAIL" || !workerActive) return null;
    const current = await readState();
    const targetIds = new Set(assignedTargets().map((target) => target.id));
    const localSubmitting = Object.keys(current.pendingActions ?? {}).some((id) => targetIds.has(id))
      || current.actionQueue?.some((item) => item.workerId === workerId);
    const localComplete = targetIds.size > 0 && [...targetIds].every((id) => current.courseStatuses?.[id]?.status === "REGISTERED");
    if (localComplete) return null;
    const phase = pollPhaseFor({
      mode: current.mode,
      schedule: { phase: current.pollPhase },
      submitting: localSubmitting
    });
    const delayMs = randomPollDelayMs({ phase, category: workerSlot.category, random: randomSource });
    if (!Number.isFinite(delayMs)) {
      if (current.nextReloadAt !== null) await writeState({ ...current, nextReloadAt: null, pollPhase: phase });
      return null;
    }
    await writeState({ ...current, nextReloadAt: now() + delayMs, pollPhase: phase });
    reloadTimer = pageWindow.setTimeout(async () => {
      const live = await readState();
      if (!workerActive) return;
      const liveSubmitting = Object.keys(live.pendingActions ?? {}).some((id) => targetIds.has(id))
        || live.actionQueue?.some((item) => item.workerId === workerId);
      const livePhase = pollPhaseFor({
        mode: live.mode,
        schedule: { phase: live.pollPhase },
        submitting: liveSubmitting
      });
      if (randomPollDelayMs({ phase: livePhase, category: workerSlot.category, random: randomSource }) !== null) pageWindow.location.reload();
    }, delayMs);
    return delayMs;
  };

  const tick = async () => {
    let current = await readState();
    if (current.mode === "SCHEDULED") {
      if (!clockSyncIsFresh(current.clockSync, now(), config.clockSyncIntervalMs)) await syncClock(false);
      current = await readState();
      const wasRunning = current.running;
      const next = applyScheduleTick(current, correctedCurrentTime(current));
      const changed = next.mode !== current.mode
        || next.running !== current.running
        || next.pollPhase !== current.pollPhase
        || next.activeWindowId !== current.activeWindowId
        || next.nextTransitionAt !== current.nextTransitionAt;
      if (changed) current = await publishControlState(next);
      if (isController && current.mode !== "STOPPED") await ensureWorkers();
      if (!wasRunning && current.running) {
        message = "预约窗口已开始，正在自动选课";
        await scan({ allowActions: true });
      }
      await scheduleReload();
    } else if (current.mode === "MANUAL") {
      if (isController) await ensureWorkers();
      await scheduleReload();
    } else {
      clearReload();
    }
    await updatePanel();
    return readState();
  };

  const test = async () => {
    message = "Test：只识别，不执行动作";
    await syncClock(false);
    await ensureWorkers();
    return scan({ allowActions: false });
  };

  const startImmediate = async () => {
    await syncClock(true);
    let current = startManualRuntime(await readState(), now());
    current = { ...current, targets: config.targets, selectionWindows: config.selectionWindows };
    await publishControlState(current);
    message = "手动立即启动：正在极速检测并选课";
    await ensureWorkers();
    const result = await scan({ allowActions: true });
    await scheduleReload();
    await updatePanel();
    return result;
  };

  const startScheduled = async (selectionWindows = config.selectionWindows) => {
    const candidate = saveableConfig({ ...config, selectionWindows });
    const validation = validateConfig(candidate);
    if (!validation.valid) {
      message = `预约时间错误：${validation.errors.join(", ")}`;
      await updatePanel();
      return false;
    }
    config = candidate;
    await configStorage.set(config);
    await syncClock(true);
    const current = await readState();
    let scheduled = scheduleRuntime(current, config.selectionWindows, correctedCurrentTime(current));
    scheduled = { ...scheduled, targets: config.targets };
    await publishControlState(scheduled);
    message = scheduled.running ? "当前窗口已开放，立即自动选课" : "预约成功，等待下一选课窗口";
    await ensureWorkers();
    await scan({ allowActions: scheduled.running });
    await scheduleReload();
    await updatePanel();
    return true;
  };

  const stop = async (reason = null) => {
    clearReload();
    const stopped = stopRuntime(await readState(), now());
    await publishControlState(stopped);
    message = `${reason ?? "已停止"}；可立即启动或重新预约`;
    await updatePanel();
  };

  const saveConfig = async (candidate) => {
    const normalized = saveableConfig(candidate);
    const validation = validateConfig(normalized);
    if (!validation.valid) {
      const error = `设置错误：${validation.errors.join(", ")}`;
      await publishControlState(stopRuntime(await readState(), now(), error));
      message = error;
      await updatePanel();
      return false;
    }
    config = normalized;
    await configStorage.set(config);
    const stopped = stopRuntime(await readState(), now());
    stopped.targets = config.targets;
    stopped.selectionWindows = config.selectionWindows;
    stopped.courseStatuses = {};
    await publishControlState(stopped);
    await writeWorkerPool({});
    mountPanel();
    message = "设置已保存，请立即启动或预约启动";
    await updatePanel();
    return true;
  };

  const savePanelLayout = (nextLayout) => {
    panelLayout = nextLayout;
    if (layoutSaveTimer) pageWindow.clearTimeout(layoutSaveTimer);
    layoutSaveTimer = pageWindow.setTimeout(() => {
      layoutSaveTimer = null;
      void panelLayoutStorage.set(panelLayout);
    }, 150);
  };

  const flushPanelLayout = async () => {
    if (!panelLayout) return;
    if (layoutSaveTimer) {
      pageWindow.clearTimeout(layoutSaveTimer);
      layoutSaveTimer = null;
    }
    await panelLayoutStorage.set(panelLayout);
  };

  const onPageHide = () => { void flushPanelLayout(); };

  const mountPanel = () => {
    if (!isController) return;
    if (panel) panelLayout = panel.getLayout();
    panel?.destroy();
    panel = createPanel(document, {
      config,
      callbacks: { test, startImmediate, startScheduled, stop: () => stop(), saveConfig },
      layout: { initial: panelLayout, onChange: savePanelLayout }
    });
  };

  const initialize = async () => {
    gm.addStyle?.(PANEL_CSS);
    if (isController) {
      mountPanel();
    } else {
      workerActive = await claimCurrentWorker();
      workerPanel = createWorkerStatusBar(document, {
        slot: workerSlot ?? { slotId: "OBSERVER", category: "ME", targetIds: [] },
        targets: config.targets,
        observerOnly: !workerActive
      });
    }
    pageWindow.addEventListener("pagehide", onPageHide);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") void stop("Esc 已停止");
    });
    stateStorage.listen((next) => {
      if (!next || next.version !== 3) return;
      void updatePanel();
      if (next.mode === "STOPPED") clearReload();
    });
    controlStorage.listen((next, previous, remote) => {
      if (!next || next.version !== 3) return;
      void updatePanel();
      if (remote && workerActive && (next.running || next.mode === "SCHEDULED") && previous?.generation !== next.generation) {
        void scan({ allowActions: next.running }).then(scheduleReload);
      }
      if (next.mode === "STOPPED") clearReload();
    });
    panelLayoutStorage.listen((next, _previous, remote) => {
      if (!remote || !next) return;
      if (panel?.applyLayout(next)) panelLayout = panel.getLayout();
    });
    workerPoolStorage.listen((next, _previous, remote) => {
      if (!remote || !workerSlot || !workerActive) {
        void updatePanel();
        return;
      }
      if (next?.[workerSlot.slotId]?.ownerId !== workerId) {
        workerActive = false;
        clearReload();
      }
      void updatePanel();
    });
    if (isController) {
      gm.registerMenuCommand?.("MIS Test", () => test());
      gm.registerMenuCommand?.("MIS 立即启动", () => startImmediate());
      gm.registerMenuCommand?.("MIS 预约启动", () => startScheduled());
      gm.registerMenuCommand?.("MIS Stop", () => stop());
      gm.registerMenuCommand?.("显示/展开 Yang 面板", () => panel?.expand());
      gm.registerMenuCommand?.("重置 Yang 面板位置", () => panel?.resetLayout());
    }

    await syncClock(false);
    let current = await readState();
    if (current.mode === "SCHEDULED") {
      await tick();
      current = await readState();
    }
    await scan({ allowActions: current.running });
    if (current.mode !== "STOPPED") await ensureWorkers();
    await scheduleReload();

    if (autoTimers) {
      heartbeatTimer = pageWindow.setInterval(async () => {
        await heartbeatCurrentWorker();
        await tick();
      }, 3000);
      uiTimer = pageWindow.setInterval(() => { void updatePanel(); }, 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void tick().then(() => scan({ allowActions: state.running }));
      });
      if (workerActive) {
        let mutationTimer = null;
        mutationObserver = new pageWindow.MutationObserver((mutations) => {
          const external = mutations.some((mutation) => !mutation.target.closest?.("#yang-worker-status, #bnbu-course-assistant"));
          if (!external || mutationTimer) return;
          mutationTimer = pageWindow.setTimeout(() => {
            mutationTimer = null;
            void scan({ allowActions: state.running }).then(scheduleReload);
          }, 25);
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
      }
    }
    await updatePanel();
    return { pageType, config };
  };

  return {
    initialize,
    scan,
    test,
    startImmediate,
    startScheduled,
    stop,
    syncClock,
    tick,
    saveConfig,
    getState: readState,
    destroy() {
      clearReload();
      if (heartbeatTimer) pageWindow.clearInterval(heartbeatTimer);
      if (uiTimer) pageWindow.clearInterval(uiTimer);
      if (actionAttemptTimer) pageWindow.clearTimeout(actionAttemptTimer);
      if (returnToDetailTimer) pageWindow.clearTimeout(returnToDetailTimer);
      mutationObserver?.disconnect();
      pageWindow.removeEventListener("pagehide", onPageHide);
      void flushPanelLayout();
      panel?.destroy();
      workerPanel?.destroy();
    }
  };
};
