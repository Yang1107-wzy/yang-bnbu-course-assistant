// ==UserScript==
// @name         Yang 抢课脚本
// @namespace    https://github.com/Yang1107-wzy/yang-bnbu-course-assistant
// @version      1.2.1
// @description  BNBU MIS 可视化自动选课与轮候助手，支持北京时间预约和即时启动
// @author       Yang1107-wzy
// @license      MIT
// @homepageURL  https://github.com/Yang1107-wzy/yang-bnbu-course-assistant
// @supportURL   https://github.com/Yang1107-wzy/yang-bnbu-course-assistant/issues
// @updateURL    https://raw.githubusercontent.com/Yang1107-wzy/yang-bnbu-course-assistant/main/dist/yang-bnbu-course-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/Yang1107-wzy/yang-bnbu-course-assistant/main/dist/yang-bnbu-course-assistant.user.js
// @match        https://mis.bnbu.edu.cn/mis/student/es/elective.do*
// @match        https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  // src/action_queue.js
  var entryKey = (target2, action) => `${target2.id ?? `${target2.courseCode}:${target2.section}`}:${action}`;
  var enqueueCandidates = (queue = [], candidates = [], workerId, observedAt = Date.now(), priority = 0) => {
    const next = [...queue];
    for (const candidate of candidates) {
      const key = entryKey(candidate.target, candidate.decision.action);
      const action = candidate.decision.action === "SELECT" ? candidate.row?.selectAction : candidate.row?.joinWaitingAction;
      const entry = {
        key,
        workerId,
        priority,
        targetId: candidate.target.id ?? `${candidate.target.courseCode}:${candidate.target.section}`,
        courseCode: candidate.target.courseCode,
        section: candidate.target.section,
        actionType: candidate.decision.action,
        functionName: action?.functionName ?? null,
        argument: action?.argument ?? null,
        observedAt
      };
      const existingIndex = next.findIndex((item) => item.key === key);
      if (existingIndex >= 0) {
        if (priority > (next[existingIndex].priority ?? 0)) next[existingIndex] = entry;
        continue;
      }
      next.push(entry);
    }
    return next.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.observedAt - right.observedAt);
  };
  var actionSignatureMatches = (queued, evaluation) => {
    const action = evaluation?.decision?.action === "SELECT" ? evaluation.row?.selectAction : evaluation?.row?.joinWaitingAction;
    return Boolean(action && queued.actionType === evaluation.decision.action && queued.functionName === action.functionName && queued.argument === action.argument);
  };
  var claimNextAction = (state, workerId, now = Date.now(), spacingMs = 250) => {
    const head = state.actionQueue?.[0] ?? null;
    const lock = state.actionLock;
    if (!head || head.workerId !== workerId) return { claimed: null, state };
    if (lock && lock.expiresAt > now) return { claimed: null, state };
    if (Number.isFinite(state.lastActionAt) && now - state.lastActionAt < spacingMs) return { claimed: null, state };
    return {
      claimed: head,
      state: {
        ...state,
        actionLock: { ownerId: workerId, key: head.key, acquiredAt: now, expiresAt: now + 4e3 }
      }
    };
  };
  var finishAction = (state, key, completedAt = Date.now()) => ({
    ...state,
    actionQueue: (state.actionQueue ?? []).filter((item) => item.key !== key),
    actionLock: null,
    lastActionAt: completedAt
  });
  var releaseAction = (state, key) => ({
    ...state,
    actionQueue: (state.actionQueue ?? []).filter((item) => item.key !== key),
    actionLock: null
  });

  // src/course_parser.js
  var CourseStatus = Object.freeze({
    SELECTABLE: "SELECTABLE",
    WAITLIST_AVAILABLE: "WAITLIST_AVAILABLE",
    WAITING: "WAITING",
    REGISTERED: "REGISTERED",
    TIME_CONFLICT: "TIME_CONFLICT",
    CREDIT_LIMIT: "CREDIT_LIMIT",
    NOT_ELIGIBLE: "NOT_ELIGIBLE",
    FULL_NO_WAITLIST: "FULL_NO_WAITLIST",
    SESSION_EXPIRED: "SESSION_EXPIRED",
    UNKNOWN: "UNKNOWN"
  });
  var normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  var normalizeCourseName = (value) => normalizeText(value).replace(/\s*\(\d{4}\)\s*$/, "").toLowerCase();
  var headerKey = (value) => normalizeText(value).toLowerCase();
  var mapHeaders = (row) => {
    const map = /* @__PURE__ */ new Map();
    Array.from(row.cells).forEach((cell, index) => {
      const key = headerKey(cell.textContent);
      if (key.includes("course code") || key.includes("\u8BFE\u7A0B\u7F16\u7801")) map.set("courseCode", index);
      else if (key.startsWith("course") || key.includes("\u79D1\u76EE")) map.set("courseName", index);
      else if (key.includes("curriculum") || key.includes("\u8BFE\u7A0B\u7C7B\u522B")) map.set("category", index);
      else if (key.includes("teacher") || key.includes("\u6559\u5E08")) map.set("teacher", index);
      else if (key.includes("time") || key.includes("\u65F6\u95F4")) map.set("schedule", index);
      else if (key.includes("selection") || key.includes("operator") || key.includes("\u64CD\u4F5C")) map.set("action", index);
    });
    return map;
  };
  var parseJavascriptAction = (element2) => {
    if (!element2) return null;
    const href = element2.getAttribute("href") ?? "";
    const match = href.match(/^javascript:([A-Za-z_$][\w$]*)\(\s*['"]([^'"]+)['"]/);
    if (!match) return null;
    return { element: element2, functionName: match[1], argument: match[2] };
  };
  var parseAllActions = (row) => Array.from(row.querySelectorAll("a[href]")).map(parseJavascriptAction).filter(Boolean);
  var findAction = (row, allowedFunctions) => {
    for (const link of row.querySelectorAll("a[href]")) {
      const action = parseJavascriptAction(link);
      if (action && allowedFunctions.includes(action.functionName)) return action;
    }
    return null;
  };
  var textAt = (row, headers, key) => {
    const index = headers.get(key);
    return index === void 0 || !row.cells[index] ? "" : normalizeText(row.cells[index].textContent);
  };
  var rowTextContent = (row) => Array.from(row.cells).map((cell) => normalizeText(cell.textContent)).join(" ");
  var parseCourseRows = (document) => {
    const parsed = [];
    for (const table of document.querySelectorAll("table")) {
      const rows = Array.from(table.rows);
      const headerRow = rows.find((row) => {
        const text = headerKey(row.textContent);
        return text.includes("course code") || text.includes("\u8BFE\u7A0B\u7F16\u7801");
      });
      if (!headerRow) continue;
      const headers = mapHeaders(headerRow);
      for (const row of rows.slice(headerRow.rowIndex + 1)) {
        const courseCode = textAt(row, headers, "courseCode").toUpperCase();
        const courseName = textAt(row, headers, "courseName");
        const section = courseName.match(/\((\d{4})\)/)?.[1] ?? null;
        if (!courseCode || !section) continue;
        const rowText2 = rowTextContent(row);
        const actions = parseAllActions(row);
        const selectAction = findAction(row, ["selectItem", "selectItemFromWaiting"]);
        const joinWaitingAction = findAction(row, ["joinWaiting"]);
        const wasWaiting = /\bWaiting\b/i.test(rowText2) && !/Join Waiting List/i.test(rowText2);
        let status = CourseStatus.UNKNOWN;
        if (selectAction) status = CourseStatus.SELECTABLE;
        else if (joinWaitingAction) status = CourseStatus.WAITLIST_AVAILABLE;
        else if (/\bSelected\b/i.test(rowText2)) status = CourseStatus.REGISTERED;
        else if (/\bClash\b/i.test(rowText2)) status = CourseStatus.TIME_CONFLICT;
        else if (wasWaiting) status = CourseStatus.WAITING;
        parsed.push({
          courseCode,
          courseName,
          section,
          category: textAt(row, headers, "category"),
          teacher: textAt(row, headers, "teacher"),
          scheduleText: textAt(row, headers, "schedule"),
          status,
          wasWaiting,
          selectAction,
          joinWaitingAction,
          searchAction: findAction(row, ["viewElective"]),
          forbiddenActions: actions.filter((action) => ["replaceItem", "dropItem", "exitWaiting"].includes(action.functionName)),
          rowElement: row,
          confidence: status === CourseStatus.UNKNOWN ? 0.5 : 1,
          reasons: status === CourseStatus.UNKNOWN ? ["no-known-action"] : [`status:${status}`]
        });
      }
    }
    return parsed;
  };
  var findUniqueCourse = (rows, target2) => {
    const expectedName = normalizeCourseName(target2.courseName);
    const matches = rows.filter((row) => row.courseCode === target2.courseCode.toUpperCase() && row.section === target2.section && (!expectedName || normalizeCourseName(row.courseName) === expectedName));
    return matches.length === 1 ? matches[0] : null;
  };
  var detectSessionExpired = (document) => {
    const text = normalizeText(document.body?.textContent).toLowerCase();
    const hasLoginForm = Boolean(document.querySelector('input[type="password"], form[action*="login"]'));
    return hasLoginForm && /session expired|login|sign in|登录/.test(text);
  };

  // src/action_executor.js
  var ALLOWED_FUNCTIONS = Object.freeze({
    SELECT: /* @__PURE__ */ new Set(["selectItem", "selectItemFromWaiting"]),
    JOIN_WAITLIST: /* @__PURE__ */ new Set(["joinWaiting"])
  });
  var confirmationMatches = (message, target2, actionType) => {
    const text = normalizeText(message).toLowerCase();
    const course = normalizeText(`${target2.courseName} (${target2.section})`).toLowerCase();
    if (!text.includes(course)) return false;
    if (actionType === "SELECT") return text.includes("select") && !text.includes("join waiting list");
    if (actionType === "JOIN_WAITLIST") return text.includes("join waiting list") || text.includes("\u52A0\u5165\u8F6E\u5019");
    return false;
  };
  var normalizedCourseName = (value) => normalizeText(value).replace(/\s*\(\d{4}\)\s*$/, "").toLowerCase();
  var executePageAction = ({ row, target: target2, actionType, pageWindow }) => {
    if (row.courseCode !== target2.courseCode || row.section !== target2.section || normalizedCourseName(row.courseName) !== normalizedCourseName(target2.courseName)) {
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
      const matches = confirmationMatches(message, target2, actionType);
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

  // src/browser_storage.js
  var createKeyValueStorage = (key, api, fallback) => ({
    get: async () => api.getValue(key, fallback),
    set: async (value) => api.setValue(key, value),
    delete: async () => api.deleteValue(key),
    listen: (callback) => api.addValueChangeListener(key, (_name, oldValue, newValue, remote) => {
      callback(newValue, oldValue, remote);
    })
  });

  // src/clock_sync.js
  var localFallback = (syncedAt, error) => ({
    source: "LOCAL",
    offsetMs: 0,
    rttMs: null,
    uncertaintyMs: null,
    syncedAt,
    error
  });
  var estimateClockSync = ({ serverDate, sentAt, receivedAt }) => {
    const serverDateMs = Date.parse(String(serverDate ?? ""));
    if (!Number.isFinite(serverDateMs) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) {
      return localFallback(Number.isFinite(receivedAt) ? receivedAt : Date.now(), "clock-sync-invalid-date");
    }
    const rttMs = receivedAt - sentAt;
    const midpoint = sentAt + rttMs / 2;
    return {
      source: "BNBU_SERVER",
      offsetMs: Math.round(serverDateMs - midpoint),
      rttMs,
      uncertaintyMs: Math.ceil(rttMs / 2 + 500),
      syncedAt: receivedAt,
      error: null
    };
  };
  var syncServerClock = async ({
    fetchFn,
    url,
    now = Date.now,
    timeoutMs = 1e3,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout
  }) => {
    const sentAt = now();
    const timeoutToken = Symbol("clock-sync-timeout");
    let timeoutId = null;
    try {
      const fetchPromise = fetchFn(url, {
        method: "HEAD",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "follow"
      });
      const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeoutFn(() => resolve(timeoutToken), timeoutMs);
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      if (response === timeoutToken) return localFallback(now(), "clock-sync-timeout");
      const receivedAt = now();
      const result = estimateClockSync({ serverDate: response?.headers?.get?.("Date"), sentAt, receivedAt });
      return result.source === "BNBU_SERVER" ? result : localFallback(receivedAt, "clock-sync-invalid-date");
    } catch {
      return localFallback(now(), "clock-sync-fetch-failed");
    } finally {
      if (timeoutId !== null) clearTimeoutFn(timeoutId);
    }
  };
  var correctedNow = (localNow, sync) => localNow + (Number.isFinite(sync?.offsetMs) ? sync.offsetMs : 0);
  var clockSyncIsFresh = (sync, localNow, maxAgeMs = 3e5) => sync?.source === "BNBU_SERVER" && Number.isFinite(sync.syncedAt) && Number.isFinite(localNow) && localNow - sync.syncedAt >= 0 && localNow - sync.syncedAt <= maxAgeMs;

  // src/time_scheduler.js
  var BEIJING_OFFSET_MS = 8 * 60 * 60 * 1e3;
  var DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
  var DEFAULT_SELECTION_WINDOWS = [
    { id: "round-1", label: "\u7B2C\u4E00\u8F6E", enabled: true, startText: "2026-07-20T10:00:00", endText: "2026-07-20T13:00:00" },
    { id: "round-2", label: "\u7B2C\u4E8C\u8F6E", enabled: true, startText: "2026-07-20T15:00:00", endText: "2026-07-20T18:00:00" },
    { id: "round-3", label: "\u7B2C\u4E09\u8F6E", enabled: true, startText: "2026-07-21T10:00:00", endText: "2026-07-22T18:00:00" }
  ];
  var pad = (value) => String(value).padStart(2, "0");
  var formatBeijingDateTime = (epochMs) => {
    if (!Number.isFinite(epochMs)) return "";
    const date = new Date(epochMs + BEIJING_OFFSET_MS);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  };
  var parseBeijingDateTime = (value) => {
    const text = String(value ?? "").trim();
    const match = text.match(DATE_TIME_PATTERN);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const epochMs = Date.UTC(year, month - 1, day, hour - 8, minute, second);
    return formatBeijingDateTime(epochMs) === text ? epochMs : null;
  };
  var validateSelectionWindows = (input) => {
    const errors = [];
    if (!Array.isArray(input) || input.length === 0) return { valid: false, errors: ["selection-windows-required"], windows: [] };
    const ids = /* @__PURE__ */ new Set();
    const windows = input.map((raw, index) => {
      const id = String(raw?.id ?? `window-${index + 1}`).trim();
      const label = String(raw?.label ?? `\u7A97\u53E3 ${index + 1}`).trim();
      const enabled2 = raw?.enabled !== false;
      const startText = String(raw?.startText ?? "").trim();
      const endText = String(raw?.endText ?? "").trim();
      const startAt = parseBeijingDateTime(startText);
      const endAt = parseBeijingDateTime(endText);
      if (!id || ids.has(id)) errors.push(`invalid-or-duplicate-window-id:${id}`);
      ids.add(id);
      if (!label) errors.push(`window-label-required:${id}`);
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) errors.push(`invalid-window-time:${id}`);
      else if (endAt <= startAt) errors.push(`window-end-not-after-start:${id}`);
      return { id, label, enabled: enabled2, startText, endText, startAt, endAt };
    });
    const enabled = windows.filter((window2) => window2.enabled && Number.isFinite(window2.startAt) && Number.isFinite(window2.endAt)).sort((left, right) => left.startAt - right.startAt);
    if (enabled.length === 0) errors.push("enabled-selection-window-required");
    for (let index = 1; index < enabled.length; index += 1) {
      if (enabled[index].startAt < enabled[index - 1].endAt) errors.push(`overlapping-selection-windows:${enabled[index - 1].id}:${enabled[index].id}`);
    }
    return { valid: errors.length === 0, errors, windows };
  };
  var normalizedEnabledWindows = (windows) => {
    if (!Array.isArray(windows)) return [];
    if (windows.every((window2) => Number.isFinite(window2.startAt) && Number.isFinite(window2.endAt))) {
      return windows.filter((window2) => window2.enabled !== false).slice().sort((left, right) => left.startAt - right.startAt);
    }
    const validated = validateSelectionWindows(windows);
    return validated.valid ? validated.windows.filter((window2) => window2.enabled).sort((left, right) => left.startAt - right.startAt) : [];
  };
  var evaluateSchedule = (windows, nowMs) => {
    const enabled = normalizedEnabledWindows(windows);
    const activeWindow = enabled.find((window2) => nowMs >= window2.startAt && nowMs < window2.endAt) ?? null;
    const nextWindow = enabled.find((window2) => window2.startAt > nowMs) ?? null;
    if (activeWindow) {
      const phase2 = nowMs - activeWindow.startAt < 12e4 ? "BURST" : "NORMAL";
      return { phase: phase2, activeWindow, nextWindow, nextTransitionAt: activeWindow.endAt, complete: false };
    }
    if (!nextWindow) return { phase: "COMPLETE", activeWindow: null, nextWindow: null, nextTransitionAt: null, complete: true };
    const untilStart = nextWindow.startAt - nowMs;
    const phase = untilStart <= 3e4 ? "BURST" : "NORMAL";
    return { phase, activeWindow: null, nextWindow, nextTransitionAt: nextWindow.startAt, complete: false };
  };
  var pollPhaseFor = ({ mode, schedule, submitting }) => {
    if (submitting) return "PAUSED";
    if (mode === "MANUAL") return "BURST";
    if (mode === "SCHEDULED") return schedule?.phase ?? "NORMAL";
    return "STOPPED";
  };
  var boundedRandom = (random) => Math.min(1, Math.max(0, Number(random?.() ?? Math.random())));
  var interpolate = (minimum, maximum, random) => Math.round(minimum + (maximum - minimum) * boundedRandom(random));
  var randomPollDelayMs = ({ phase, category, random }) => {
    const ranges = {
      NORMAL: [3e3, 3e3],
      BURST: [1e3, 1e3]
    };
    const range = ranges[phase];
    if (!range) return null;
    const base = interpolate(range[0], range[1], random);
    void category;
    return base;
  };
  var allTargetsRegistered = (targets, statuses) => Array.isArray(targets) && targets.length > 0 && targets.every((target2) => {
    const key = target2.id ?? `${target2.courseCode}:${target2.section}`;
    const current = statuses?.[key];
    return (typeof current === "string" ? current : current?.status) === "REGISTERED";
  });

  // src/config_manager.js
  var target = (courseCode, courseName, section, category) => ({
    id: `${courseCode}:${section}`,
    courseCode,
    courseName,
    section,
    category,
    allowDirectSelect: true,
    allowJoinWaitingList: true
  });
  var LEGACY_DEMO_TARGETS = [
    target("DEMO1001", "Example Major Elective", "1001", "ME"),
    target("DEMO2001", "Example Technology Course", "1001", "ME"),
    target("DEMO3001", "Example Free Elective", "1002", "FE")
  ];
  var DEFAULT_TARGETS = [
    target("AI3133", "Natural Language Processing", "1001", "ME"),
    target("COMP4213", "Wireless Communication and Mobile Computing", "1001", "ME"),
    target("EBIS3113", "Business Forecasting and Machine Learning", "1002", "FE")
  ];
  var cloneWindows = (windows) => windows.map(({ id, label, enabled, startText, endText }) => ({ id, label, enabled, startText, endText }));
  var createDefaultConfig = () => ({
    version: 3,
    actionSpacingMs: 250,
    maxWorkers: 6,
    maxActionsPerMinute: 6,
    sameCourseCooldownMs: 8e3,
    maxConsecutiveErrors: 3,
    actionLockTtlMs: 4e3,
    controllerHeartbeatTimeoutMs: 6e4,
    clockSyncIntervalMs: 3e5,
    selectionWindows: cloneWindows(DEFAULT_SELECTION_WINDOWS),
    targets: DEFAULT_TARGETS.map((item) => ({ ...item }))
  });
  var normalizeTarget = (input) => {
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
  var cleanWindows = (input) => cloneWindows(Array.isArray(input) ? input : DEFAULT_SELECTION_WINDOWS);
  var cleanConfig = (input) => {
    const defaults = createDefaultConfig();
    const numeric = (key) => Number.isFinite(Number(input?.[key])) ? Number(input[key]) : defaults[key];
    return {
      version: 3,
      actionSpacingMs: numeric("actionSpacingMs"),
      maxWorkers: numeric("maxWorkers"),
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
  var sameTargets = (left, right) => Array.isArray(left) && left.length === right.length && left.every((item, index) => {
    const normalized = normalizeTarget(item);
    const expected = normalizeTarget(right[index]);
    return normalized.courseCode === expected.courseCode && normalized.courseName === expected.courseName && normalized.section === expected.section && normalized.category === expected.category;
  });
  var migrateConfig = (input) => cleanConfig(sameTargets(input?.targets, LEGACY_DEMO_TARGETS) ? { ...input, targets: DEFAULT_TARGETS } : input);
  var validateConfig = (config) => {
    const errors = [];
    if (!config || typeof config !== "object") return { valid: false, errors: ["config-must-be-an-object"] };
    if (config.version !== 3) errors.push("unsupported-config-version");
    if (!Array.isArray(config.targets) || config.targets.length === 0) errors.push("targets-required");
    const keys = /* @__PURE__ */ new Set();
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
    if (!Number.isFinite(config.clockSyncIntervalMs) || config.clockSyncIntervalMs < 6e4) errors.push("clock-sync-interval-invalid");
    if (!Number.isInteger(config.maxWorkers) || config.maxWorkers < 1 || config.maxWorkers > 6) errors.push("max-workers-invalid");
    return { valid: errors.length === 0, errors };
  };
  var saveableConfig = (config) => cleanConfig(config);

  // src/course_page_adapter.js
  var detectPageType = (locationLike) => {
    const path = locationLike.pathname;
    if (path === "/mis/student/es/elective.do") return "OVERVIEW";
    if (path === "/mis/student/es/eleDetail.do") return "DETAIL";
    return "UNKNOWN";
  };
  var rowText = (row) => Array.from(row.cells ?? []).map((cell) => normalizeText(cell.textContent)).join(" ");
  var detectCategory = (text) => {
    const normalized = normalizeText(text).toUpperCase();
    if (normalized.includes("MAJOR ELECTIVE") || /(^|\s)ME($|\s)/.test(normalized)) return "ME";
    if (/(^|\s)FE($|\s)/.test(normalized)) return "FE";
    return null;
  };
  var findCategoryDetailLinks = (document, locationLike) => {
    const result = {};
    for (const table of document.querySelectorAll("table")) {
      let currentCategory = null;
      for (const row of table.rows) {
        currentCategory = detectCategory(rowText(row)) ?? currentCategory;
        if (!currentCategory) continue;
        const candidates = Array.from(row.querySelectorAll('a[href*="eleDetail.do"]'));
        if (candidates.length !== 1) continue;
        result[currentCategory] = new URL(candidates[0].getAttribute("href"), locationLike.href).href;
      }
    }
    return result;
  };

  // src/logger.js
  var ALLOWED_FIELDS = /* @__PURE__ */ new Set([
    "timestamp",
    "level",
    "event",
    "mode",
    "armed",
    "dryRun",
    "courseCode",
    "previousStatus",
    "currentStatus",
    "action",
    "reason",
    "pagePath",
    "error"
  ]);
  var redact = (value) => String(value ?? "").replace(/(token|cookie|session|jsessionid|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").replace(/\b\d{10}\b/g, "[REDACTED_ID]");
  var pathFromUrl = (value) => {
    try {
      return new URL(value).pathname;
    } catch {
      return "";
    }
  };
  var sanitizeLogEntry = (entry) => {
    const candidate = { ...entry };
    if (candidate.pageUrl) candidate.pagePath = pathFromUrl(candidate.pageUrl);
    delete candidate.pageUrl;
    const clean = {};
    for (const [key, value] of Object.entries(candidate)) {
      if (!ALLOWED_FIELDS.has(key) || value === void 0 || value === null || value === "") continue;
      clean[key] = key === "error" ? redact(value) : value;
    }
    return clean;
  };
  var CSV_FIELDS = [
    "timestamp",
    "event",
    "courseCode",
    "level",
    "mode",
    "armed",
    "dryRun",
    "previousStatus",
    "currentStatus",
    "action",
    "reason",
    "pagePath",
    "error"
  ];
  var csvCell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  var AuditLogger = class {
    constructor(storage, maxEntries = 1e3) {
      this.storage = storage;
      this.maxEntries = maxEntries;
    }
    async append(entry) {
      const entries = await this.storage.get();
      const next = [...Array.isArray(entries) ? entries : [], sanitizeLogEntry(entry)].slice(-this.maxEntries);
      await this.storage.set(next);
      return next[next.length - 1];
    }
    async exportJSON() {
      const entries = await this.storage.get();
      return JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
    }
    async exportCSV() {
      const entries = await this.storage.get();
      const rows = (Array.isArray(entries) ? entries : []).map((entry) => CSV_FIELDS.map((field) => csvCell(entry[field])).join(","));
      return [CSV_FIELDS.join(","), ...rows].join("\n");
    }
  };

  // src/decision_engine.js
  var decision = (target2, action, allowed, reason, requiresConfirmation = false) => ({
    action,
    allowed,
    reason,
    courseCode: target2.courseCode,
    requiresConfirmation
  });
  var automationGate = (target2, action, context) => {
    if (!context.running) return decision(target2, action, false, "test-only", true);
    return null;
  };
  var decideCourseAction = (target2, row, context) => {
    if (!row) return decision(target2, "NOTIFY", false, "course-not-uniquely-matched");
    if (row.status === CourseStatus.REGISTERED) return decision(target2, "NONE", false, "already-registered");
    if (row.status === CourseStatus.UNKNOWN) return decision(target2, "NOTIFY", false, "unknown-course-state");
    if (row.status === CourseStatus.TIME_CONFLICT) return decision(target2, "NOTIFY", false, "time-conflict");
    if (row.status === CourseStatus.WAITING) return decision(target2, "NONE", false, "already-waiting");
    if (row.status === CourseStatus.SELECTABLE) {
      if (!target2.allowDirectSelect) return decision(target2, "NOTIFY", false, "direct-select-disabled");
      return automationGate(target2, "SELECT", context) ?? decision(target2, "SELECT", true, "selectable-and-running");
    }
    if (row.status === CourseStatus.WAITLIST_AVAILABLE) {
      if (!target2.allowJoinWaitingList) return decision(target2, "NOTIFY", false, "waitlist-disabled");
      return automationGate(target2, "JOIN_WAITLIST", context) ?? decision(target2, "JOIN_WAITLIST", true, "waitlist-available-and-running");
    }
    return decision(target2, "NOTIFY", false, `unsupported-state:${row.status}`);
  };

  // src/runtime_engine.js
  var planCourseScan = ({ targets, rows, context }) => {
    const courseStatuses = { ...context.courseStatuses ?? {} };
    const matchedRows = /* @__PURE__ */ new Map();
    for (const target2 of targets) {
      const matched = findUniqueCourse(rows, target2);
      if (matched) {
        matchedRows.set(`${target2.courseCode}:${target2.section}`, matched);
        courseStatuses[target2.courseCode] = matched.status;
      }
    }
    const evaluations = [];
    for (const target2 of targets) {
      const key = `${target2.courseCode}:${target2.section}`;
      const row = matchedRows.get(key);
      if (!row) continue;
      const decision2 = decideCourseAction(target2, row, {
        ...context,
        courseStatuses,
        waitlistCount: context.waitlistCounts?.[key] ?? null
      });
      evaluations.push({ target: target2, row, decision: decision2 });
    }
    return {
      courseStatuses,
      evaluations,
      candidates: evaluations.filter((evaluation) => evaluation.decision.allowed),
      next: evaluations.find((evaluation) => evaluation.decision.allowed) ?? null
    };
  };

  // src/runtime_state.js
  var localClock = () => ({
    source: "LOCAL",
    offsetMs: 0,
    rttMs: null,
    uncertaintyMs: null,
    syncedAt: null,
    error: "not-synced"
  });
  var executableState = () => ({
    actionQueue: [],
    actionLock: null,
    pendingActions: {}
  });
  var createRuntimeStateV3 = (now = Date.now()) => ({
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
  var createRuntimeControlV3 = (now = Date.now()) => ({
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
  var applyRuntimeControl = (state, control) => {
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
  var recordPendingAction = (pendingActions, targetId2, actionType, submittedAt = Date.now()) => ({
    ...pendingActions,
    [targetId2]: { actionType, submittedAt, verifyAfter: submittedAt + 15e3 }
  });
  var reconcilePendingActionsV3 = (pendingActions = {}, observedStatuses = {}, now = Date.now()) => {
    const next = {};
    const blocked = /* @__PURE__ */ new Set();
    const verified = [];
    const failed = [];
    for (const [targetId2, pending] of Object.entries(pendingActions)) {
      const status = observedStatuses[targetId2];
      const success = pending.actionType === "SELECT" ? status === "REGISTERED" : ["WAITING", "REGISTERED"].includes(status);
      if (success) {
        verified.push({ targetId: targetId2, actionType: pending.actionType, status });
        continue;
      }
      if (status === void 0 || now < pending.verifyAfter) {
        next[targetId2] = pending;
        blocked.add(targetId2);
        continue;
      }
      failed.push({ targetId: targetId2, actionType: pending.actionType, status });
    }
    return { pendingActions: next, blocked, verified, failed };
  };
  var startManualRuntime = (state, now = Date.now()) => ({
    ...state,
    ...executableState(),
    version: 3,
    updatedAt: now,
    mode: "MANUAL",
    running: true,
    scheduleEnabled: false,
    activeWindowId: null,
    nextTransitionAt: null,
    pollPhase: "BURST",
    nextReloadAt: null,
    lastError: null
  });
  var scheduleRuntime = (state, windows, now = Date.now()) => {
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
  var applyScheduleTick = (state, now = Date.now()) => {
    if (state.mode !== "SCHEDULED" || !state.scheduleEnabled) return state;
    const schedule = evaluateSchedule(state.selectionWindows, now);
    if (schedule.complete) return stopRuntime(state, now);
    const running = Boolean(schedule.activeWindow);
    return {
      ...state,
      ...running ? {} : executableState(),
      updatedAt: now,
      running,
      activeWindowId: schedule.activeWindow?.id ?? null,
      nextTransitionAt: schedule.nextTransitionAt,
      pollPhase: schedule.phase,
      nextReloadAt: null
    };
  };
  var stopRuntime = (state, now = Date.now(), error = null) => ({
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

  // src/panel_layout.js
  var VIEWPORT_MARGIN = 8;
  var DEFAULT_WIDTH = 380;
  var DEFAULT_HEIGHT = 520;
  var MIN_WIDTH = 300;
  var MIN_HEIGHT = 220;
  var COLLAPSED_WIDTH = 104;
  var COLLAPSED_HEIGHT = 44;
  var finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  var clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  var viewportOf = (pageWindow) => ({
    width: Math.max(1, finite(pageWindow?.innerWidth, 1024)),
    height: Math.max(1, finite(pageWindow?.innerHeight, 768))
  });
  var normalizePanelLayout = (input = {}, viewport = { width: 1024, height: 768 }) => {
    const viewportWidth = Math.max(1, finite(viewport.width, 1024));
    const viewportHeight = Math.max(1, finite(viewport.height, 768));
    const maxWidth = Math.max(MIN_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
    const maxHeight = Math.max(MIN_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
    const width = clamp(finite(input?.width, DEFAULT_WIDTH), MIN_WIDTH, maxWidth);
    const height = clamp(finite(input?.height, DEFAULT_HEIGHT), MIN_HEIGHT, maxHeight);
    const defaultLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - 18);
    const defaultTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - 18);
    const left = clamp(finite(input?.left, defaultLeft), VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    const top = clamp(finite(input?.top, defaultTop), VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
    return { left, top, width, height, collapsed: input?.collapsed === true };
  };
  var isInteractive = (target2) => Boolean(target2?.closest?.("button,input,select,textarea,a,label,[contenteditable='true']"));
  var createPanelLayoutController = ({
    pageWindow,
    root,
    dragHandle,
    resizeHandle,
    initialLayout,
    onLayoutChange = () => {
    }
  }) => {
    let layout = normalizePanelLayout(initialLayout, viewportOf(pageWindow));
    let interaction = null;
    let destroyed = false;
    let previousUserSelect = "";
    const visibleSize = () => layout.collapsed ? { width: COLLAPSED_WIDTH, height: COLLAPSED_HEIGHT } : { width: layout.width, height: layout.height };
    const clampPosition = (left, top) => {
      const viewport = viewportOf(pageWindow);
      const size = visibleSize();
      return {
        left: clamp(left, VIEWPORT_MARGIN, viewport.width - size.width - VIEWPORT_MARGIN),
        top: clamp(top, VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN)
      };
    };
    const render = () => {
      const position = clampPosition(layout.left, layout.top);
      layout = { ...layout, ...position };
      root.dataset.collapsed = String(layout.collapsed);
      root.style.left = `${layout.left}px`;
      root.style.top = `${layout.top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
      root.style.width = layout.collapsed ? `${COLLAPSED_WIDTH}px` : `${layout.width}px`;
      root.style.height = layout.collapsed ? `${COLLAPSED_HEIGHT}px` : `${layout.height}px`;
    };
    const emit = () => onLayoutChange({ ...layout });
    const begin = (type, event) => {
      if (destroyed || event.button > 0) return;
      if (type === "drag" && isInteractive(event.target)) return;
      if (type === "resize" && layout.collapsed) return;
      event.preventDefault();
      previousUserSelect = root.ownerDocument.documentElement.style.userSelect;
      root.ownerDocument.documentElement.style.userSelect = "none";
      root.dataset.layoutInteracting = "true";
      interaction = {
        type,
        startX: event.clientX,
        startY: event.clientY,
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height
      };
    };
    const move = (event) => {
      if (!interaction || destroyed) return;
      event.preventDefault();
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      if (interaction.type === "drag") {
        const position = clampPosition(interaction.left + deltaX, interaction.top + deltaY);
        layout = { ...layout, ...position };
      } else {
        const viewport = viewportOf(pageWindow);
        layout = {
          ...layout,
          width: clamp(interaction.width + deltaX, MIN_WIDTH, viewport.width - layout.left - VIEWPORT_MARGIN),
          height: clamp(interaction.height + deltaY, MIN_HEIGHT, viewport.height - layout.top - VIEWPORT_MARGIN)
        };
      }
      render();
    };
    const end = () => {
      if (!interaction || destroyed) return;
      interaction = null;
      root.ownerDocument.documentElement.style.userSelect = previousUserSelect;
      delete root.dataset.layoutInteracting;
      emit();
    };
    const onDragStart = (event) => begin("drag", event);
    const onResizeStart = (event) => begin("resize", event);
    const onViewportResize = () => {
      if (interaction || destroyed) return;
      layout = normalizePanelLayout(layout, viewportOf(pageWindow));
      render();
      emit();
    };
    dragHandle.addEventListener("pointerdown", onDragStart);
    resizeHandle.addEventListener("pointerdown", onResizeStart);
    pageWindow.addEventListener("pointermove", move);
    pageWindow.addEventListener("pointerup", end);
    pageWindow.addEventListener("pointercancel", end);
    pageWindow.addEventListener("resize", onViewportResize);
    render();
    return {
      expand() {
        layout = normalizePanelLayout({ ...layout, collapsed: false }, viewportOf(pageWindow));
        render();
        emit();
      },
      collapse() {
        layout = { ...layout, collapsed: true };
        render();
        emit();
      },
      reset() {
        layout = normalizePanelLayout({}, viewportOf(pageWindow));
        render();
        emit();
      },
      apply(nextLayout) {
        if (interaction || destroyed) return false;
        layout = normalizePanelLayout(nextLayout, viewportOf(pageWindow));
        render();
        return true;
      },
      getLayout: () => ({ ...layout }),
      destroy() {
        if (destroyed) return;
        destroyed = true;
        root.ownerDocument.documentElement.style.userSelect = previousUserSelect;
        dragHandle.removeEventListener("pointerdown", onDragStart);
        resizeHandle.removeEventListener("pointerdown", onResizeStart);
        pageWindow.removeEventListener("pointermove", move);
        pageWindow.removeEventListener("pointerup", end);
        pageWindow.removeEventListener("pointercancel", end);
        pageWindow.removeEventListener("resize", onViewportResize);
      }
    };
  };

  // src/ui_panel.js
  var element = (document, tag, className = "", text = void 0) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  };
  var PANEL_CSS = `
#bnbu-course-assistant{position:fixed;right:18px;bottom:18px;width:380px;height:min(520px,calc(100vh - 36px));display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;z-index:2147483647;background:rgba(30,30,32,.97);color:#f5f5f5;border:1px solid #58595f;border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.38);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#bnbu-course-assistant[data-running="true"]{border:2px solid #4ade80}
#bnbu-course-assistant[data-mode="SCHEDULED"]{border:2px solid #60a5fa}
#bnbu-course-assistant[data-error="true"]{border:2px solid #ff4d4f}
#bnbu-course-assistant .ca-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex:none;padding:11px 13px;border-bottom:1px solid #4a4b50;font-weight:750;cursor:move;touch-action:none}
#bnbu-course-assistant .ca-head-controls{display:flex;align-items:center;gap:7px}
#bnbu-course-assistant .ca-title-short,#bnbu-course-assistant .ca-state-short,#bnbu-course-assistant .ca-expand{display:none}
#bnbu-course-assistant .ca-head button{padding:2px 7px;border-radius:6px;font-size:14px;line-height:20px}
#bnbu-course-assistant .ca-body{flex:1;min-height:0;overflow:auto}
#bnbu-course-assistant .ca-state{font-weight:800;color:#ffcc66}
#bnbu-course-assistant[data-running="true"] .ca-state{color:#4ade80}
#bnbu-course-assistant[data-mode="SCHEDULED"] .ca-state{color:#93c5fd}
#bnbu-course-assistant .ca-time{padding:8px 12px;display:grid;gap:3px;color:#ddd;font-size:13px}
#bnbu-course-assistant .ca-time-row{display:flex;justify-content:space-between;gap:8px}
#bnbu-course-assistant .ca-time-value{text-align:right;color:#f3f4f6}
#bnbu-course-assistant input,#bnbu-course-assistant select{box-sizing:border-box;border:1px solid #666;border-radius:6px;background:#f8f8f8;color:#171717;padding:5px 6px}
#bnbu-course-assistant .ca-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 12px 9px}
#bnbu-course-assistant button{border:0;border-radius:8px;padding:8px;cursor:pointer;font-weight:700;background:#eee;color:#181818}
#bnbu-course-assistant [data-action="start-immediate"]{background:#45d483;color:#082513}
#bnbu-course-assistant [data-action="start-scheduled"]{background:#60a5fa;color:#0b1c36}
#bnbu-course-assistant [data-action="stop"]{background:#ff5a5f;color:white}
#bnbu-course-assistant [data-action="settings"]{grid-column:1/-1}
#bnbu-course-assistant .ca-courses{padding:0 12px}
#bnbu-course-assistant .ca-course{background:#38393e;border-radius:8px;padding:8px 9px;margin:7px 0}
#bnbu-course-assistant .ca-course-title{font-weight:750}
#bnbu-course-assistant .ca-course-status{color:#ffd666;margin-top:3px;word-break:break-word}
#bnbu-course-assistant .ca-message{margin:9px 12px 12px;padding:8px;background:#25262a;border-radius:7px;color:#d7d7d7}
#bnbu-course-assistant .ca-blessing{padding:0 12px 12px;text-align:center;color:#f7d774;font-weight:700}
#bnbu-course-assistant .ca-editor{padding:10px 12px;border-top:1px solid #4a4b50}
#bnbu-course-assistant .ca-editor-title{font-weight:750;margin:4px 0 7px}
#bnbu-course-assistant .ca-target-row{display:grid;grid-template-columns:82px 1fr 56px 50px 28px;gap:5px;margin-bottom:6px}
#bnbu-course-assistant .ca-window-row{display:grid;grid-template-columns:24px 58px 1fr 1fr;gap:5px;margin-bottom:6px;align-items:center}
#bnbu-course-assistant .ca-target-row input,#bnbu-course-assistant .ca-target-row select,#bnbu-course-assistant .ca-window-row input{width:100%;min-width:0}
#bnbu-course-assistant .ca-target-row button{padding:4px;background:#6a3032;color:white}
#bnbu-course-assistant .ca-editor-actions{display:flex;gap:7px;margin-top:8px}
#bnbu-course-assistant .ca-resize{position:absolute;right:2px;bottom:2px;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 0 45%,#a8a8ad 46% 54%,transparent 55% 65%,#a8a8ad 66% 74%,transparent 75%);opacity:.8}
#bnbu-course-assistant[data-collapsed="true"]{border-radius:22px}
#bnbu-course-assistant[data-collapsed="true"] .ca-body,#bnbu-course-assistant[data-collapsed="true"] .ca-resize,#bnbu-course-assistant[data-collapsed="true"] .ca-title-full,#bnbu-course-assistant[data-collapsed="true"] .ca-state,#bnbu-course-assistant[data-collapsed="true"] .ca-collapse{display:none}
#bnbu-course-assistant[data-collapsed="true"] .ca-title-short,#bnbu-course-assistant[data-collapsed="true"] .ca-state-short,#bnbu-course-assistant[data-collapsed="true"] .ca-expand{display:inline-flex}
#bnbu-course-assistant[data-collapsed="true"] .ca-head{height:100%;box-sizing:border-box;padding:7px 9px;border:0}
#bnbu-course-assistant .ca-state-short{width:9px;height:9px;border-radius:50%;background:#ffcc66}
#bnbu-course-assistant[data-running="true"] .ca-state-short{background:#4ade80}
#bnbu-course-assistant[data-mode="SCHEDULED"] .ca-state-short{background:#93c5fd}
#bnbu-course-assistant[data-error="true"] .ca-state-short{background:#ff4d4f}
#yang-worker-status{position:fixed;right:12px;top:12px;z-index:2147483646;max-width:290px;padding:8px 10px;border-radius:9px;background:rgba(30,30,32,.94);color:#f5f5f5;border:1px solid #58595f;box-shadow:0 5px 18px rgba(0,0,0,.28);font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none}
#yang-worker-status .ca-worker-title{font-weight:800;color:#93c5fd;margin-bottom:4px}
#yang-worker-status .ca-worker-target{margin-top:3px}
#yang-worker-status .ca-worker-state{color:#ffd666}
#yang-worker-status[data-complete="true"]{border-color:#4ade80}
#yang-worker-status[data-error="true"]{border-color:#ff5a5f}
`;
  var targetKey = (target2) => target2.id ?? `${target2.courseCode}:${target2.section}`;
  var STATUS_LABELS = Object.freeze({
    OPENING: "\u6B63\u5728\u6253\u5F00 Worker",
    SCANNING: "\u9AD8\u901F\u626B\u63CF\u4E2D",
    NOT_FOUND: "\u5F53\u524D\u9875\u9762\u672A\u627E\u5230",
    UNKNOWN: "\u6682\u4E0D\u53EF\u9009",
    TIME_CONFLICT: "\u65F6\u95F4\u51B2\u7A81",
    SELECTABLE: "\u53EF\u76F4\u63A5\u9009\u62E9",
    WAITLIST_AVAILABLE: "\u53EF\u52A0\u5165\u8F6E\u5019",
    SUBMITTING: "\u6B63\u5728\u63D0\u4EA4",
    WAITING: "\u5DF2\u52A0\u5165\u8F6E\u5019",
    REGISTERED: "\u5DF2\u62A2\u5230",
    FAILED: "\u6267\u884C\u5931\u8D25",
    ERROR: "\u6267\u884C\u5931\u8D25",
    WORKER_OFFLINE: "Worker \u5931\u8054"
  });
  var statusText = (current) => {
    if (!current) return "\u672A\u626B\u63CF";
    const pieces = [STATUS_LABELS[current.status] ?? current.status];
    if (current.workerSlotId?.startsWith("HOT-")) pieces.push(`\u524D\u53F0\u9875 ${current.workerSlotId.slice(4)}`);
    else if (current.workerSlotId) pieces.push(`Worker ${current.workerSlotId}`);
    if (current.actionType) pieces.push(current.actionType);
    if (Number.isFinite(current.attempts) && current.attempts > 0) pieces.push(`\u5C1D\u8BD5 ${current.attempts}`);
    if (current.reason && current.reason !== STATUS_LABELS[current.status]) pieces.push(current.reason);
    if (current.scannedAt) pieces.push(current.scannedAt);
    return pieces.join(" \xB7 ");
  };
  var createWorkerStatusBar = (document, { slot, targets = [], observerOnly = false, hotPage = false }) => {
    document.querySelector("#yang-worker-status")?.remove();
    const root = element(document, "aside");
    root.id = "yang-worker-status";
    const titleText = observerOnly ? "Yang \xB7 \u975E Worker\uFF0C\u53EF\u5173\u95ED" : hotPage ? `Yang \u524D\u53F0\u4F18\u5148\u9875 \xB7 ${slot.category}` : `Yang Worker \xB7 ${slot.slotId}`;
    const title = element(document, "div", "ca-worker-title", titleText);
    const targetRefs = /* @__PURE__ */ new Map();
    root.append(title);
    if (!observerOnly) {
      for (const id of slot.targetIds) {
        const target2 = targets.find((item) => targetKey(item) === id);
        const row = element(document, "div", "ca-worker-target");
        row.append(element(document, "div", "", target2 ? `${target2.courseCode} (${target2.section})` : id));
        const state = element(document, "div", "ca-worker-state", "\u6B63\u5728\u6253\u5F00 Worker");
        row.append(state);
        root.append(row);
        targetRefs.set(id, state);
      }
    }
    document.body.append(root);
    return {
      root,
      update(view = {}) {
        let complete = targetRefs.size > 0;
        let error = false;
        for (const [id, ref] of targetRefs) {
          const current = view.courseStatuses?.[id];
          ref.textContent = statusText(current);
          complete &&= current?.status === "REGISTERED";
          error ||= ["FAILED", "ERROR", "WORKER_OFFLINE"].includes(current?.status);
        }
        root.dataset.complete = String(complete);
        root.dataset.error = String(error);
      },
      destroy() {
        root.remove();
      }
    };
  };
  var createTargetEditorRow = (document, editor, target2 = {}) => {
    const row = element(document, "div", "ca-target-row");
    row.dataset.targetRow = "true";
    for (const [name, placeholder] of [["courseCode", "\u8BFE\u7A0B\u4EE3\u7801"], ["courseName", "\u8BFE\u7A0B\u540D\u79F0"], ["section", "\u73ED\u53F7"]]) {
      const input = element(document, "input");
      input.dataset.targetField = name;
      input.placeholder = placeholder;
      input.value = target2[name] ?? "";
      row.append(input);
    }
    const category = element(document, "select");
    category.dataset.targetField = "category";
    for (const value of ["ME", "FE"]) {
      const option = element(document, "option", "", value);
      option.value = value;
      category.append(option);
    }
    category.value = target2.category ?? "ME";
    row.append(category);
    const remove = element(document, "button", "", "\xD7");
    remove.type = "button";
    remove.addEventListener("click", () => row.remove());
    row.append(remove);
    editor.append(row);
  };
  var createWindowEditorRow = (document, editor, window2) => {
    const row = element(document, "div", "ca-window-row");
    row.dataset.windowRow = "true";
    row.dataset.windowId = window2.id;
    const enabled = element(document, "input");
    enabled.type = "checkbox";
    enabled.checked = window2.enabled !== false;
    enabled.dataset.windowField = "enabled";
    const label = element(document, "input");
    label.value = window2.label;
    label.dataset.windowField = "label";
    const start = element(document, "input");
    start.type = "datetime-local";
    start.step = "1";
    start.value = window2.startText;
    start.dataset.windowField = "startText";
    const end = element(document, "input");
    end.type = "datetime-local";
    end.step = "1";
    end.value = window2.endText;
    end.dataset.windowField = "endText";
    row.append(enabled, label, start, end);
    editor.append(row);
  };
  var readTargets = (editor) => Array.from(editor.querySelectorAll("[data-target-row]")).map((row) => ({
    courseCode: row.querySelector('[data-target-field="courseCode"]').value,
    courseName: row.querySelector('[data-target-field="courseName"]').value,
    section: row.querySelector('[data-target-field="section"]').value,
    category: row.querySelector('[data-target-field="category"]').value
  }));
  var readWindows = (editor) => Array.from(editor.querySelectorAll("[data-window-row]")).map((row) => ({
    id: row.dataset.windowId,
    label: row.querySelector('[data-window-field="label"]').value,
    enabled: row.querySelector('[data-window-field="enabled"]').checked,
    startText: row.querySelector('[data-window-field="startText"]').value.replace(/\.000$/, ""),
    endText: row.querySelector('[data-window-field="endText"]').value.replace(/\.000$/, "")
  }));
  var timeRow = (document, label, field) => {
    const row = element(document, "div", "ca-time-row");
    row.append(element(document, "span", "", label));
    const value = element(document, "span", "ca-time-value", "\u2014");
    value.dataset.field = field;
    row.append(value);
    return { row, value };
  };
  var createPanel = (document, { config, callbacks, layout = {} }) => {
    document.querySelector("#bnbu-course-assistant")?.remove();
    const root = element(document, "section");
    root.id = "bnbu-course-assistant";
    root.dataset.running = "false";
    root.dataset.mode = "STOPPED";
    root.dataset.error = "false";
    const head = element(document, "div", "ca-head");
    const titles = element(document, "div", "ca-head-title");
    titles.append(
      element(document, "span", "ca-title-full", "Yang \u62A2\u8BFE\u811A\u672C"),
      element(document, "span", "ca-title-short", "Yang")
    );
    const stateLabel = element(document, "span", "ca-state", "STOPPED");
    const stateShort = element(document, "span", "ca-state-short");
    stateShort.title = "STOPPED";
    const collapse = element(document, "button", "ca-collapse", "\u2014");
    collapse.type = "button";
    collapse.title = "\u6536\u8D77\u9762\u677F";
    collapse.dataset.panelAction = "collapse";
    const expand = element(document, "button", "ca-expand", "\u2197");
    expand.type = "button";
    expand.title = "\u5C55\u5F00\u9762\u677F";
    expand.dataset.panelAction = "expand";
    const headControls = element(document, "div", "ca-head-controls");
    headControls.append(stateLabel, stateShort, collapse, expand);
    head.append(titles, headControls);
    root.append(head);
    const body = element(document, "div", "ca-body");
    body.dataset.panelBody = "true";
    const time = element(document, "div", "ca-time");
    const beijingClock = timeRow(document, "\u5317\u4EAC\u65F6\u95F4", "beijing-clock");
    const clockSync = timeRow(document, "\u6821\u65F6", "clock-sync");
    const nextWindow = timeRow(document, "\u4E0B\u4E00\u7A97\u53E3", "next-window");
    const pollPhase = timeRow(document, "\u8F6E\u8BE2", "poll-phase");
    time.append(beijingClock.row, clockSync.row, nextWindow.row, pollPhase.row);
    body.append(time);
    const actions = element(document, "div", "ca-actions");
    for (const [action, label] of [
      ["test", "Test"],
      ["start-immediate", "\u7ACB\u5373\u542F\u52A8"],
      ["start-scheduled", "\u9884\u7EA6\u542F\u52A8"],
      ["stop", "Stop"],
      ["settings", "\u8BBE\u7F6E"]
    ]) {
      const button = element(document, "button", "", label);
      button.type = "button";
      button.dataset.action = action;
      actions.append(button);
    }
    body.append(actions);
    const courses = element(document, "div", "ca-courses");
    const courseRefs = /* @__PURE__ */ new Map();
    for (const target2 of config.targets) {
      const card = element(document, "div", "ca-course");
      const key = targetKey(target2);
      card.dataset.courseKey = key;
      card.append(element(document, "div", "ca-course-title", `${target2.courseCode} (${target2.section}) \u2014 ${target2.courseName}`));
      const status = element(document, "div", "ca-course-status", "\u672A\u626B\u63CF");
      card.append(status);
      courses.append(card);
      courseRefs.set(key, status);
    }
    body.append(courses);
    const editor = element(document, "div", "ca-editor");
    editor.dataset.settingsEditor = "true";
    editor.hidden = true;
    editor.append(element(document, "div", "ca-editor-title", "\u76EE\u6807\u8BFE\u7A0B"));
    for (const target2 of config.targets) createTargetEditorRow(document, editor, target2);
    const add = element(document, "button", "", "+ \u6DFB\u52A0\u8BFE\u7A0B");
    add.type = "button";
    add.dataset.editorAction = "add";
    add.addEventListener("click", () => createTargetEditorRow(document, editor));
    editor.append(add, element(document, "div", "ca-editor-title", "\u5317\u4EAC\u65F6\u95F4\u7A97\u53E3"));
    for (const window2 of config.selectionWindows) createWindowEditorRow(document, editor, window2);
    const save = element(document, "button", "", "\u4FDD\u5B58\u8BBE\u7F6E");
    save.type = "button";
    save.dataset.editorAction = "save";
    save.addEventListener("click", () => callbacks.saveConfig?.({
      ...config,
      targets: readTargets(editor),
      selectionWindows: readWindows(editor)
    }));
    const editorActions = element(document, "div", "ca-editor-actions");
    editorActions.append(save);
    editor.append(editorActions);
    body.append(editor);
    const message = element(document, "div", "ca-message", "\u70B9\u51FB Test \u68C0\u67E5\uFF0C\u6216\u9009\u62E9\u7ACB\u5373/\u9884\u7EA6\u542F\u52A8");
    body.append(message, element(document, "div", "ca-blessing", "\u795D\u60A8\u62A2\u5230\u5FC3\u4EEA\u8BFE\u7A0B"));
    const resizeHandle = element(document, "div", "ca-resize");
    resizeHandle.dataset.resizeHandle = "true";
    resizeHandle.title = "\u62D6\u52A8\u8C03\u6574\u9762\u677F\u5927\u5C0F";
    root.append(body, resizeHandle);
    document.body.append(root);
    const layoutController = createPanelLayoutController({
      pageWindow: document.defaultView,
      root,
      dragHandle: head,
      resizeHandle,
      initialLayout: layout.initial,
      onLayoutChange: layout.onChange
    });
    root.querySelector('[data-action="test"]').addEventListener("click", () => callbacks.test?.());
    root.querySelector('[data-action="start-immediate"]').addEventListener("click", () => callbacks.startImmediate?.());
    root.querySelector('[data-action="start-scheduled"]').addEventListener("click", () => callbacks.startScheduled?.(readWindows(editor)));
    root.querySelector('[data-action="stop"]').addEventListener("click", () => callbacks.stop?.());
    root.querySelector('[data-action="settings"]').addEventListener("click", () => {
      editor.hidden = !editor.hidden;
    });
    collapse.addEventListener("click", () => layoutController.collapse());
    expand.addEventListener("click", () => layoutController.expand());
    return {
      root,
      update(view) {
        const mode = view.mode ?? "STOPPED";
        root.dataset.running = String(Boolean(view.running));
        root.dataset.mode = mode;
        root.dataset.error = String(Boolean(view.error));
        stateLabel.textContent = view.error ? "ERROR" : view.running ? "RUNNING" : mode === "SCHEDULED" ? "SCHEDULED" : "STOPPED";
        stateShort.title = stateLabel.textContent;
        beijingClock.value.textContent = view.beijingNowText ?? "\u2014";
        clockSync.value.textContent = view.clockSyncText ?? "\u672C\u673A\u65F6\u949F";
        nextWindow.value.textContent = view.nextWindowText ?? "\u2014";
        pollPhase.value.textContent = view.pollPhaseText ?? "STOPPED";
        message.textContent = view.message ?? "";
        for (const [key, status] of courseRefs) {
          const current = view.courseStatuses?.[key];
          status.textContent = statusText(current);
        }
      },
      expand: () => layoutController.expand(),
      collapse: () => layoutController.collapse(),
      resetLayout: () => layoutController.reset(),
      applyLayout: (nextLayout) => layoutController.apply(nextLayout),
      getLayout: () => layoutController.getLayout(),
      destroy() {
        layoutController.destroy();
        root.remove();
      }
    };
  };

  // src/worker_pool.js
  var targetId = (target2) => target2.id ?? `${target2.courseCode}:${target2.section}`;
  var CATEGORIES = ["ME", "FE"];
  var parseHash = (value) => new URL(`https://yang.invalid/?${String(value ?? "").replace(/^#/, "")}`).searchParams;
  var groupedTargets = (targets) => CATEGORIES.map((category) => ({ category, targets: targets.filter((target2) => target2.category === category) })).filter((group) => group.targets.length > 0);
  var buildWorkerAssignments = (targets = [], maxWorkers = 6) => {
    const groups = groupedTargets(targets);
    const limit = Math.max(1, Math.min(Number(maxWorkers) || 6, targets.length || 1));
    if (targets.length === 0) return [];
    const counts = Object.fromEntries(groups.map((group) => [group.category, 1]));
    let allocated = groups.length;
    while (allocated < limit) {
      const candidate = groups.filter((group) => counts[group.category] < group.targets.length).sort((left, right) => right.targets.length / (counts[right.category] + 1) - left.targets.length / (counts[left.category] + 1))[0];
      if (!candidate) break;
      counts[candidate.category] += 1;
      allocated += 1;
    }
    return groups.flatMap((group) => {
      const slots = Array.from({ length: counts[group.category] }, (_, index) => ({
        slotId: `${group.category}-${index + 1}`,
        category: group.category,
        targetIds: []
      }));
      group.targets.forEach((target2, index) => slots[index % slots.length].targetIds.push(targetId(target2)));
      return slots;
    });
  };
  var createWorkerUrl = (baseUrl, slot, openingToken) => {
    const url = new URL(baseUrl);
    const hash = parseHash(url.hash);
    hash.set("yang-worker", slot.slotId);
    hash.set("yang-category", slot.category);
    hash.set("yang-targets", slot.targetIds.join(","));
    hash.set("yang-opening", openingToken);
    url.hash = hash.toString();
    return url.href;
  };
  var parseWorkerMarker = (location) => {
    const hash = parseHash(location?.hash);
    const slotId = hash.get("yang-worker");
    const category = hash.get("yang-category");
    const openingToken = hash.get("yang-opening");
    const targetIds = String(hash.get("yang-targets") ?? "").split(",").filter(Boolean);
    if (!slotId || !CATEGORIES.includes(category) || !openingToken || targetIds.length === 0) return null;
    if (!slotId.startsWith(`${category}-`)) return null;
    return { slotId, category, targetIds, openingToken };
  };
  var workerSlotIsHealthy = (registry = {}, slotId, now = Date.now(), heartbeatTtlMs = 6e4) => {
    const current = registry?.[slotId];
    return Boolean(current?.ownerId && Number.isFinite(current.heartbeatAt) && now - current.heartbeatAt <= heartbeatTtlMs);
  };
  var reserveWorkerOpening = (registry = {}, slot, openingToken, now = Date.now(), openingTtlMs = 3e4, heartbeatTtlMs = 6e4) => {
    const current = registry?.[slot.slotId];
    const openingHealthy = current?.phase === "OPENING" && current.openingUntil > now;
    if (openingHealthy || workerSlotIsHealthy(registry, slot.slotId, now, heartbeatTtlMs)) {
      return { reserved: false, registry };
    }
    return {
      reserved: true,
      registry: {
        ...registry,
        [slot.slotId]: {
          slotId: slot.slotId,
          category: slot.category,
          targetIds: [...slot.targetIds],
          phase: "OPENING",
          openingToken,
          openingUntil: now + openingTtlMs,
          ownerId: null,
          heartbeatAt: null,
          lastScanAt: current?.lastScanAt ?? null
        }
      }
    };
  };
  var reserveWorkerOpenings = (registry = {}, slots = [], tokenFactory, now = Date.now(), openingTtlMs = 6e4, heartbeatTtlMs = 6e4) => {
    let nextRegistry = registry;
    const reservations = [];
    for (const slot of slots) {
      const openingToken = tokenFactory(slot);
      const result = reserveWorkerOpening(
        nextRegistry,
        slot,
        openingToken,
        now,
        openingTtlMs,
        heartbeatTtlMs
      );
      if (!result.reserved) continue;
      nextRegistry = result.registry;
      reservations.push({ slot, openingToken });
    }
    return { registry: nextRegistry, reservations };
  };
  var claimWorkerSlot = (registry = {}, slot, workerId, openingToken, now = Date.now(), heartbeatTtlMs = 6e4) => {
    const current = registry?.[slot.slotId];
    const ownedByAnother = workerSlotIsHealthy(registry, slot.slotId, now, heartbeatTtlMs) && current.ownerId !== workerId;
    const tokenMismatch = current?.openingToken && current.openingToken !== openingToken && current.ownerId !== workerId;
    if (ownedByAnother || tokenMismatch) return { claimed: false, registry };
    return {
      claimed: true,
      registry: {
        ...registry,
        [slot.slotId]: {
          slotId: slot.slotId,
          category: slot.category,
          targetIds: [...slot.targetIds],
          phase: "ONLINE",
          openingToken: null,
          openingUntil: null,
          ownerId: workerId,
          heartbeatAt: now,
          lastScanAt: current?.lastScanAt ?? null
        }
      }
    };
  };
  var heartbeatWorkerSlot = (registry = {}, slotId, workerId, now = Date.now(), lastScanAt) => {
    const current = registry?.[slotId];
    if (!current || current.ownerId !== workerId) return { updated: false, registry };
    return {
      updated: true,
      registry: {
        ...registry,
        [slotId]: {
          ...current,
          phase: "ONLINE",
          heartbeatAt: now,
          lastScanAt: lastScanAt ?? current.lastScanAt ?? null
        }
      }
    };
  };

  // src/assistant_runtime.js
  var CONFIG_KEY_V2 = "bnbu.courseAssistant.config.v2";
  var STATE_KEY_V3 = "bnbu.courseAssistant.state.v3";
  var CONFIG_KEY_V3 = "bnbu.courseAssistant.config.v3";
  var CONTROL_KEY_V3 = "bnbu.courseAssistant.control.v3";
  var PANEL_LAYOUT_KEY = "bnbu.courseAssistant.panelLayout.v1";
  var WORKER_POOL_KEY = "bnbu.courseAssistant.workerPool.v1";
  var MIGRATION_KEY_V12 = "bnbu.courseAssistant.migration.v1.2.0";
  var LOG_KEY_V3 = "bnbu.courseAssistant.logs.v3";
  var WORKER_ID_KEY_V3 = "bnbu.courseAssistant.workerId.v3";
  var WORKER_SESSION_KEY = "bnbu.courseAssistant.workerAssignment.v1";
  var delay = (pageWindow, ms) => new Promise((resolve) => pageWindow.setTimeout(resolve, ms));
  var randomId = (pageWindow) => pageWindow.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  var buildStorage = (key, gm2, fallback) => createKeyValueStorage(key, {
    getValue: gm2.getValue,
    setValue: gm2.setValue,
    deleteValue: gm2.deleteValue,
    addValueChangeListener: gm2.addValueChangeListener
  }, fallback);
  var withBrowserLock = (pageWindow, name, operation) => {
    const locks = pageWindow.navigator?.locks;
    return typeof locks?.request === "function" ? locks.request(name, { mode: "exclusive" }, operation) : operation();
  };
  var actionReadiness = (action, pageWindow) => action ? `${action.functionName} ${typeof pageWindow[action.functionName] === "function" ? "READY" : "\u4E0D\u53EF\u7528"}` : "\u5165\u53E3\u4E0D\u53EF\u7528";
  var displayReason = (row, reason, pageWindow) => {
    if (row.status === "SELECTABLE") return `\u53EF\u76F4\u63A5\u9009 \xB7 ${actionReadiness(row.selectAction, pageWindow)}`;
    if (row.status === "WAITLIST_AVAILABLE") {
      const label = reason === "test-only" ? "\u53EF\u52A0\u5165\u8F6E\u5019\uFF1B\u542F\u52A8\u540E\u81EA\u52A8\u6267\u884C" : "\u6B63\u5728\u81EA\u52A8\u52A0\u5165\u8F6E\u5019";
      return `${label} \xB7 ${actionReadiness(row.joinWaitingAction, pageWindow)}`;
    }
    if (row.status === "WAITING") return "\u5DF2\u52A0\u5165\u8F6E\u5019";
    if (row.status === "REGISTERED") return "\u5DF2\u62A2\u5230";
    if (row.status === "TIME_CONFLICT") return "\u65F6\u95F4\u51B2\u7A81";
    return reason ?? "\u4E0D\u53EF\u9009";
  };
  var secureRandom = (pageWindow) => {
    try {
      const values = new Uint32Array(1);
      pageWindow.crypto.getRandomValues(values);
      return values[0] / 4294967295;
    } catch {
      return Math.random();
    }
  };
  var durationText = (milliseconds) => {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1e3));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds % 86400 / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = seconds % 60;
    if (days) return `${days}\u5929 ${hours}\u5C0F\u65F6`;
    if (hours) return `${hours}\u5C0F\u65F6 ${minutes}\u5206`;
    if (minutes) return `${minutes}\u5206 ${remainder}\u79D2`;
    return `${remainder}\u79D2`;
  };
  var pollPhaseText = (phase) => ({
    NORMAL: "NORMAL \xB7 3 \u79D2",
    BURST: "BURST \xB7 1 \u79D2",
    PAUSED: "PAUSED \xB7 \u7B49\u5F85\u63D0\u4EA4\u7ED3\u679C",
    COMPLETE: "COMPLETE",
    STOPPED: "STOPPED"
  })[phase] ?? phase ?? "STOPPED";
  var createAssistantRuntime = async ({
    pageWindow,
    gm: gm2,
    autoTimers = true,
    tabId,
    now = Date.now,
    random,
    fetchFn
  }) => {
    const document = pageWindow.document;
    const pageType = detectPageType(pageWindow.location);
    const randomSource = random ?? (() => secureRandom(pageWindow));
    const clockFetch = fetchFn ?? (typeof pageWindow.fetch === "function" ? pageWindow.fetch.bind(pageWindow) : async () => {
      throw new Error("fetch-unavailable");
    });
    const configStorage = buildStorage(CONFIG_KEY_V3, gm2, null);
    const legacyConfigStorage = buildStorage(CONFIG_KEY_V2, gm2, null);
    const stateStorage = buildStorage(STATE_KEY_V3, gm2, null);
    const controlStorage = buildStorage(CONTROL_KEY_V3, gm2, null);
    const panelLayoutStorage = buildStorage(PANEL_LAYOUT_KEY, gm2, null);
    const workerPoolStorage = buildStorage(WORKER_POOL_KEY, gm2, {});
    const migrationStorage = buildStorage(MIGRATION_KEY_V12, gm2, false);
    const logStorage = buildStorage(LOG_KEY_V3, gm2, []);
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
        controllerHeartbeatTimeoutMs: 6e4
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
    const isHotPage = pageType === "DETAIL" && !workerMarker;
    const workerSlot = workerMarker ? {
      slotId: workerMarker.slotId,
      category: workerMarker.category,
      targetIds: workerMarker.targetIds
    } : null;
    let hotPageCategory = null;
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
    let message = "\u70B9\u51FB Test \u68C0\u67E5\uFF0C\u6216\u9009\u62E9\u7ACB\u5373/\u9884\u7EA6\u542F\u52A8";
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
      try {
        gm2.notification?.({ title, text, timeout: 7e3 });
      } catch {
      }
    };
    const correctedCurrentTime = (current) => correctedNow(now(), current.clockSync);
    const workerAssignments = () => buildWorkerAssignments(config.targets, config.maxWorkers);
    const assignedTargets = (category = hotPageCategory) => {
      if (!workerActive) return [];
      if (isHotPage) return category ? config.targets.filter((target2) => target2.category === category) : [];
      if (!workerSlot) return [];
      const ids = new Set(workerSlot.targetIds);
      return config.targets.filter((target2) => ids.has(target2.id) && target2.category === workerSlot.category);
    };
    const sourceCategory = () => workerSlot?.category ?? hotPageCategory;
    const sourceSlotId = () => workerSlot?.slotId ?? (hotPageCategory ? `HOT-${hotPageCategory}` : "HOT");
    const readWorkerPool = async () => await workerPoolStorage.get() ?? {};
    const writeWorkerPool = async (registry) => {
      await workerPoolStorage.set(registry);
      return registry;
    };
    const claimCurrentWorkerUnlocked = async () => {
      if (!workerSlot || !workerMarker) return false;
      const validAssignment = workerAssignments().find((slot) => slot.slotId === workerSlot.slotId && slot.category === workerSlot.category && slot.targetIds.join(",") === workerSlot.targetIds.join(","));
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
      if (isHotPage) return workerActive;
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
      const syncText = sync?.source === "BNBU_SERVER" ? `BNBU SERVER \xB7 ${sync.offsetMs >= 0 ? "+" : ""}${sync.offsetMs}ms \xB7 \xB1${sync.uncertaintyMs}ms` : `\u672C\u673A\u65F6\u949F${sync?.error ? ` \xB7 ${sync.error}` : ""}`;
      const nextWindowText = current.mode === "MANUAL" ? "\u624B\u52A8\u5373\u65F6\u8FD0\u884C" : schedule.activeWindow ? `${schedule.activeWindow.label}\u8FDB\u884C\u4E2D \xB7 \u5269\u4F59 ${durationText(schedule.activeWindow.endAt - beijingNow)}` : schedule.nextWindow ? `${schedule.nextWindow.label} \xB7 ${durationText(schedule.nextWindow.startAt - beijingNow)}` : "\u6CA1\u6709\u540E\u7EED\u7A97\u53E3";
      const courseStatuses = { ...current.courseStatuses };
      for (const slot of workerAssignments()) {
        const poolEntry = workerPool[slot.slotId];
        const healthy = workerSlotIsHealthy(workerPool, slot.slotId, now(), config.controllerHeartbeatTimeoutMs);
        for (const id of slot.targetIds) {
          const previous = courseStatuses[id];
          if (["REGISTERED", "WAITING", "SUBMITTING", "FAILED"].includes(previous?.status)) {
            courseStatuses[id] = { ...previous, workerSlotId: slot.slotId };
          } else if (poolEntry?.phase === "OPENING" && poolEntry.openingUntil > now()) {
            courseStatuses[id] = { ...previous, status: "OPENING", reason: "\u6B63\u5728\u6253\u5F00 Worker", workerSlotId: slot.slotId };
          } else if (!healthy && current.mode !== "STOPPED") {
            courseStatuses[id] = { ...previous, status: "WORKER_OFFLINE", reason: "Worker \u5931\u8054\uFF0C\u7B49\u5F85\u6062\u590D", workerSlotId: slot.slotId };
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
      const slots = workerAssignments().filter((slot) => links[slot.category]);
      const reservation = reserveWorkerOpenings(
        await readWorkerPool(),
        slots,
        () => randomId(pageWindow),
        now(),
        6e4,
        config.controllerHeartbeatTimeoutMs
      );
      if (reservation.reservations.length > 0) await writeWorkerPool(reservation.registry);
      for (const { slot, openingToken } of reservation.reservations) {
        gm2.openInTab?.(createWorkerUrl(links[slot.category], slot, openingToken), { active: false, insert: true, setParent: true });
      }
      await updatePanel();
    };
    const ensureWorkers = () => withBrowserLock(pageWindow, "yang-worker-pool-v1", ensureWorkersUnlocked);
    const ensureWorkersInBackground = () => {
      void ensureWorkers().catch((error) => {
        void log({ level: "warn", event: "worker-prewarm-failed", reason: error?.message ?? "worker-prewarm-failed" });
      });
    };
    const syncClock = async (force = false) => {
      const current = await readState();
      const age = now() - (current.clockSync?.syncedAt ?? 0);
      if (!force && current.clockSync?.syncedAt && age >= 0 && age < config.clockSyncIntervalMs) return current.clockSync;
      const url = new URL("/mis/student/es/elective.do", pageWindow.location.origin).href;
      const clockSync = await syncServerClock({
        fetchFn: clockFetch,
        url,
        now,
        timeoutMs: 1e3,
        setTimeoutFn: pageWindow.setTimeout.bind(pageWindow),
        clearTimeoutFn: pageWindow.clearTimeout.bind(pageWindow)
      });
      const latest = await readState();
      await publishControlState({ ...latest, clockSync });
      await updatePanel();
      return clockSync;
    };
    const syncClockInBackground = (force = false) => {
      void syncClock(force).catch((error) => {
        void log({ level: "warn", event: "clock-sync-failed", reason: error?.message ?? "clock-sync-failed" });
      });
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
      const evaluation = evaluations.find((item) => item.target.id === claim.claimed.targetId && item.decision.action === claim.claimed.actionType);
      if (!evaluation || !actionSignatureMatches(claim.claimed, evaluation)) {
        await writeState(releaseAction(current, claim.claimed.key));
        return null;
      }
      const targetId2 = evaluation.target.id;
      const prepared = finishAction(current, claim.claimed.key, now());
      prepared.pendingActions = recordPendingAction(prepared.pendingActions, targetId2, evaluation.decision.action, now());
      prepared.courseStatuses = {
        ...prepared.courseStatuses,
        [targetId2]: {
          ...prepared.courseStatuses[targetId2],
          status: "SUBMITTING",
          reason: evaluation.decision.action === "JOIN_WAITLIST" ? "\u6B63\u5728\u63D0\u4EA4 Join Waiting" : "\u6B63\u5728\u63D0\u4EA4 Select",
          actionType: evaluation.decision.action,
          attempts: (prepared.courseStatuses[targetId2]?.attempts ?? 0) + 1,
          workerSlotId: sourceSlotId(),
          scannedAt: formatBeijingDateTime(correctedCurrentTime(prepared)).slice(11)
        }
      };
      const committed = await writeState(prepared);
      if (!committed.running) return null;
      const result = executePageAction({ row: evaluation.row, target: evaluation.target, actionType: evaluation.decision.action, pageWindow });
      if (!result.ok) {
        const failed = await readState();
        const pendingActions = { ...failed.pendingActions };
        delete pendingActions[targetId2];
        failed.pendingActions = pendingActions;
        failed.courseStatuses = {
          ...failed.courseStatuses,
          [targetId2]: {
            ...failed.courseStatuses[targetId2],
            status: "FAILED",
            reason: result.reason,
            actionType: evaluation.decision.action,
            workerSlotId: sourceSlotId(),
            retryAt: (failed.courseStatuses[targetId2]?.attempts ?? 1) >= 3 ? null : now() + 3e3,
            scannedAt: formatBeijingDateTime(correctedCurrentTime(failed)).slice(11)
          }
        };
        await writeState(failed);
        await log({ level: "error", event: "action-rejected", courseCode: evaluation.target.courseCode, action: evaluation.decision.action, reason: result.reason });
        notify("MIS \u8BFE\u7A0B\u52A8\u4F5C\u5931\u8D25", `${evaluation.target.courseCode}: ${result.reason}`);
        await updatePanel();
        return result;
      }
      await log({ level: "info", event: "action-submitted", courseCode: evaluation.target.courseCode, action: evaluation.decision.action, reason: result.reason });
      notify("MIS \u5DF2\u63D0\u4EA4\u9009\u8BFE\u52A8\u4F5C", `${evaluation.target.courseCode} ${evaluation.decision.action}`);
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
          const failed = stopRuntime(await readState(), now(), "\u767B\u5F55\u5DF2\u5931\u6548");
          await publishControlState(failed);
          notify("MIS \u81EA\u52A8\u9009\u8BFE\u5DF2\u505C\u6B62", "\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
          return { stopped: true, reason: "session-expired" };
        }
        const rows = parseCourseRows(document);
        const category = localCategoryFromRows(rows);
        if (isHotPage && category) hotPageCategory = category;
        let current = await readState();
        const targets = assignedTargets(category);
        if (workerSlot && pageType === "DETAIL" && category && category !== workerSlot.category) {
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
        for (const target2 of targets) {
          const row = findUniqueCourse(rows, target2);
          if (row) observedStatuses[target2.id] = row.status;
          else if (category && target2.category === category) observedStatuses[target2.id] = "NOT_FOUND";
        }
        const pending = reconcilePendingActionsV3(current.pendingActions, observedStatuses, now());
        current.pendingActions = pending.pendingActions;
        const pendingFailures = new Map(pending.failed.map((failure) => [failure.targetId, failure]));
        const scannedAt = formatBeijingDateTime(correctedCurrentTime(current)).slice(11);
        const statuses = { ...current.courseStatuses };
        for (const target2 of targets) {
          const row = findUniqueCourse(rows, target2);
          const previous = statuses[target2.id];
          const verificationFailure = pendingFailures.get(target2.id);
          const failureBlocked = previous?.status === "FAILED" && (previous.attempts >= 3 || Number.isFinite(previous.retryAt) && previous.retryAt > now());
          if (verificationFailure) {
            const attempts = previous?.attempts ?? 1;
            statuses[target2.id] = {
              ...previous,
              status: "FAILED",
              reason: "\u63D0\u4EA4\u540E\u672A\u89C2\u5BDF\u5230 Selected/Waiting",
              actionType: verificationFailure.actionType,
              retryAt: attempts >= 3 ? null : now() + (attempts === 1 ? 15e3 : 3e4),
              workerSlotId: sourceSlotId(),
              scannedAt
            };
          } else if (failureBlocked) {
            statuses[target2.id] = { ...previous, workerSlotId: sourceSlotId(), scannedAt };
          } else if (pending.blocked.has(target2.id)) {
            statuses[target2.id] = {
              ...statuses[target2.id],
              status: "SUBMITTING",
              reason: "\u7B49\u5F85\u9875\u9762\u786E\u8BA4\u7ED3\u679C",
              workerSlotId: sourceSlotId(),
              scannedAt
            };
          } else if (row) {
            const evaluation = plan.evaluations.find((item) => item.target.id === target2.id);
            statuses[target2.id] = {
              ...statuses[target2.id],
              status: row.status,
              reason: displayReason(row, evaluation?.decision.reason, pageWindow),
              workerSlotId: sourceSlotId(),
              scannedAt
            };
          } else if (category && target2.category === category) {
            statuses[target2.id] = {
              ...statuses[target2.id],
              status: "NOT_FOUND",
              reason: "\u5F53\u524D\u9875\u9762\u672A\u627E\u5230",
              workerSlotId: sourceSlotId(),
              scannedAt
            };
          }
        }
        current = { ...current, courseStatuses: statuses, targets: config.targets, lastError: null };
        if (allTargetsRegistered(config.targets, statuses)) {
          message = "\u6240\u6709\u76EE\u6807\u8BFE\u7A0B\u5DF2\u9009\u4E2D\uFF0C\u81EA\u52A8\u505C\u6B62";
          await publishControlState(stopRuntime(current, now()));
          await updatePanel();
          return plan;
        }
        if (current.running && allowActions) {
          const candidates = plan.candidates.filter((candidate) => {
            if (pending.blocked.has(candidate.target.id) || pendingFailures.has(candidate.target.id)) return false;
            const status = statuses[candidate.target.id];
            return !(status?.status === "FAILED" && (status.attempts >= 3 || Number.isFinite(status.retryAt) && status.retryAt > now()));
          });
          current.actionQueue = enqueueCandidates(current.actionQueue, candidates, workerId, now(), isHotPage ? 100 : 0);
        }
        await writeState(current);
        await heartbeatCurrentWorker(now());
        if (current.running && allowActions) {
          const result = await executeNextInternal(plan.evaluations);
          if (!result && current.actionQueue?.some((item) => item.workerId === workerId)) scheduleActionAttempt(plan.evaluations);
        }
        message = `\u5DF2\u626B\u63CF ${rows.length} \u6761\u8BFE\u7A0B\u884C`;
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
      const category = sourceCategory();
      if (!category) return null;
      const targetIds = new Set(assignedTargets(category).map((target2) => target2.id));
      const localSubmitting = Object.keys(current.pendingActions ?? {}).some((id) => targetIds.has(id)) || current.actionQueue?.some((item) => item.workerId === workerId);
      const localComplete = targetIds.size > 0 && [...targetIds].every((id) => current.courseStatuses?.[id]?.status === "REGISTERED");
      if (localComplete) return null;
      const phase = pollPhaseFor({
        mode: current.mode,
        schedule: { phase: current.pollPhase },
        submitting: localSubmitting
      });
      const delayMs = randomPollDelayMs({ phase, category, random: randomSource });
      if (!Number.isFinite(delayMs)) {
        if (current.nextReloadAt !== null) await writeState({ ...current, nextReloadAt: null, pollPhase: phase });
        return null;
      }
      await writeState({ ...current, nextReloadAt: now() + delayMs, pollPhase: phase });
      reloadTimer = pageWindow.setTimeout(async () => {
        const live = await readState();
        if (!workerActive) return;
        const liveSubmitting = Object.keys(live.pendingActions ?? {}).some((id) => targetIds.has(id)) || live.actionQueue?.some((item) => item.workerId === workerId);
        const livePhase = pollPhaseFor({
          mode: live.mode,
          schedule: { phase: live.pollPhase },
          submitting: liveSubmitting
        });
        if (randomPollDelayMs({ phase: livePhase, category, random: randomSource }) !== null) pageWindow.location.reload();
      }, delayMs);
      return delayMs;
    };
    const tick = async () => {
      let current = await readState();
      if (current.mode === "SCHEDULED") {
        if (!clockSyncIsFresh(current.clockSync, now(), config.clockSyncIntervalMs)) syncClockInBackground(false);
        current = await readState();
        const wasRunning = current.running;
        const next = applyScheduleTick(current, correctedCurrentTime(current));
        const changed = next.mode !== current.mode || next.running !== current.running || next.pollPhase !== current.pollPhase || next.activeWindowId !== current.activeWindowId || next.nextTransitionAt !== current.nextTransitionAt;
        if (changed) current = await publishControlState(next);
        if (isController && current.mode !== "STOPPED") ensureWorkersInBackground();
        if (!wasRunning && current.running) {
          message = "\u9884\u7EA6\u7A97\u53E3\u5DF2\u5F00\u59CB\uFF0C\u6B63\u5728\u81EA\u52A8\u9009\u8BFE";
          await scan({ allowActions: true });
        }
        await scheduleReload();
      } else if (current.mode === "MANUAL") {
        if (isController) ensureWorkersInBackground();
        await scheduleReload();
      } else {
        clearReload();
      }
      await updatePanel();
      return readState();
    };
    const test = async () => {
      message = "Test\uFF1A\u53EA\u8BC6\u522B\uFF0C\u4E0D\u6267\u884C\u52A8\u4F5C";
      const result = await scan({ allowActions: false });
      syncClockInBackground(false);
      ensureWorkersInBackground();
      return result;
    };
    const startImmediate = async () => {
      let current = startManualRuntime(await readState(), now());
      current = { ...current, targets: config.targets, selectionWindows: config.selectionWindows };
      await publishControlState(current);
      message = "\u624B\u52A8\u7ACB\u5373\u542F\u52A8\uFF1A\u6B63\u5728\u6781\u901F\u68C0\u6D4B\u5E76\u9009\u8BFE";
      syncClockInBackground(true);
      const result = await scan({ allowActions: true });
      ensureWorkersInBackground();
      await scheduleReload();
      await updatePanel();
      return result;
    };
    const startScheduled = async (selectionWindows = config.selectionWindows) => {
      const candidate = saveableConfig({ ...config, selectionWindows });
      const validation = validateConfig(candidate);
      if (!validation.valid) {
        message = `\u9884\u7EA6\u65F6\u95F4\u9519\u8BEF\uFF1A${validation.errors.join(", ")}`;
        await updatePanel();
        return false;
      }
      config = candidate;
      await configStorage.set(config);
      const current = await readState();
      let scheduled = scheduleRuntime(current, config.selectionWindows, correctedCurrentTime(current));
      scheduled = { ...scheduled, targets: config.targets };
      await publishControlState(scheduled);
      message = scheduled.running ? "\u5F53\u524D\u7A97\u53E3\u5DF2\u5F00\u653E\uFF0C\u7ACB\u5373\u81EA\u52A8\u9009\u8BFE" : "\u9884\u7EA6\u6210\u529F\uFF0C\u7B49\u5F85\u4E0B\u4E00\u9009\u8BFE\u7A97\u53E3";
      syncClockInBackground(true);
      ensureWorkersInBackground();
      await scan({ allowActions: scheduled.running });
      await scheduleReload();
      await updatePanel();
      return true;
    };
    const stop = async (reason = null) => {
      clearReload();
      const stopped = stopRuntime(await readState(), now());
      await publishControlState(stopped);
      message = `${reason ?? "\u5DF2\u505C\u6B62"}\uFF1B\u53EF\u7ACB\u5373\u542F\u52A8\u6216\u91CD\u65B0\u9884\u7EA6`;
      await updatePanel();
    };
    const saveConfig = async (candidate) => {
      const normalized = saveableConfig(candidate);
      const validation = validateConfig(normalized);
      if (!validation.valid) {
        const error = `\u8BBE\u7F6E\u9519\u8BEF\uFF1A${validation.errors.join(", ")}`;
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
      message = "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u8BF7\u7ACB\u5373\u542F\u52A8\u6216\u9884\u7EA6\u542F\u52A8";
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
    const onPageHide = () => {
      void flushPanelLayout();
    };
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
      gm2.addStyle?.(PANEL_CSS);
      if (isController) {
        mountPanel();
      } else {
        if (isHotPage) {
          hotPageCategory = localCategoryFromRows(parseCourseRows(document));
          workerActive = true;
        } else {
          workerActive = await claimCurrentWorker();
        }
        const visibleSlot = workerSlot ?? {
          slotId: hotPageCategory ? `HOT-${hotPageCategory}` : "HOT",
          category: hotPageCategory ?? "ME",
          targetIds: hotPageCategory ? config.targets.filter((target2) => target2.category === hotPageCategory).map((target2) => target2.id) : []
        };
        workerPanel = createWorkerStatusBar(document, {
          slot: visibleSlot,
          targets: config.targets,
          observerOnly: !workerActive,
          hotPage: isHotPage
        });
      }
      pageWindow.addEventListener("pagehide", onPageHide);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") void stop("Esc \u5DF2\u505C\u6B62");
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
        gm2.registerMenuCommand?.("MIS Test", () => test());
        gm2.registerMenuCommand?.("MIS \u7ACB\u5373\u542F\u52A8", () => startImmediate());
        gm2.registerMenuCommand?.("MIS \u9884\u7EA6\u542F\u52A8", () => startScheduled());
        gm2.registerMenuCommand?.("MIS Stop", () => stop());
        gm2.registerMenuCommand?.("\u663E\u793A/\u5C55\u5F00 Yang \u9762\u677F", () => panel?.expand());
        gm2.registerMenuCommand?.("\u91CD\u7F6E Yang \u9762\u677F\u4F4D\u7F6E", () => panel?.resetLayout());
      }
      let current = await readState();
      if (current.mode === "SCHEDULED") {
        await tick();
        current = await readState();
      }
      await scan({ allowActions: current.running });
      syncClockInBackground(false);
      if (current.mode !== "STOPPED") ensureWorkersInBackground();
      await scheduleReload();
      if (autoTimers) {
        heartbeatTimer = pageWindow.setInterval(async () => {
          await heartbeatCurrentWorker();
          await tick();
        }, 3e3);
        uiTimer = pageWindow.setInterval(() => {
          void updatePanel();
        }, 1e3);
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

  // src/yang-bnbu-course-assistant.user.js
  var gm = {
    getValue: (key, fallback) => GM_getValue(key, fallback),
    setValue: (key, value) => GM_setValue(key, value),
    deleteValue: (key) => GM_deleteValue(key),
    addValueChangeListener: (key, callback) => GM_addValueChangeListener(key, callback),
    addStyle: (css) => GM_addStyle(css),
    notification: (options) => GM_notification(options),
    registerMenuCommand: (name, callback) => GM_registerMenuCommand(name, callback),
    openInTab: (url, options) => GM_openInTab(url, options)
  };
  void (async () => {
    const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
    const runtime = await createAssistantRuntime({ pageWindow, gm });
    await runtime.initialize();
  })().catch((error) => {
    window.console.error("[Yang Course Assistant] Initialization failed", error);
    try {
      GM_notification({
        title: "Yang \u62A2\u8BFE\u811A\u672C\u542F\u52A8\u5931\u8D25",
        text: "\u8BF7\u6253\u5F00\u63A7\u5236\u53F0\u67E5\u770B\u9519\u8BEF\uFF1B\u811A\u672C\u672A\u6267\u884C\u4EFB\u4F55\u9009\u8BFE\u52A8\u4F5C\u3002",
        timeout: 1e4
      });
    } catch {
    }
  });
})();
