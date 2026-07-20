import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  CONFIG_KEY_V2,
  CONFIG_KEY_V3,
  CONTROL_KEY_V3,
  MIGRATION_KEY_V12,
  PANEL_LAYOUT_KEY,
  STATE_KEY_V3,
  WORKER_POOL_KEY,
  createAssistantRuntime
} from "../src/assistant_runtime.js";
import { createDefaultConfig } from "../src/config_manager.js";
import { parseBeijingDateTime } from "../src/time_scheduler.js";
import { createWorkerUrl, parseWorkerMarker } from "../src/worker_pool.js";

const createGm = (seed = {}) => {
  const values = new Map(Object.entries({
    "bnbu.courseAssistant.complianceAck.v1": {
      licenseId: "Yang-NCEL-1.0",
      noticeVersion: 1,
      accepted: true,
      acceptedAt: 1
    },
    ...seed
  }));
  const opened = [];
  const listeners = new Map();
  const menus = new Map();
  return {
    values,
    opened,
    menus,
    getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    setValue: (key, value) => {
      const old = values.get(key);
      values.set(key, value);
      for (const callback of listeners.get(key) ?? []) callback(key, old, value, false);
    },
    deleteValue: (key) => values.delete(key),
    emitRemote: (key, value) => {
      const old = values.get(key);
      values.set(key, value);
      for (const callback of listeners.get(key) ?? []) callback(key, old, value, true);
    },
    addValueChangeListener: (key, callback) => {
      listeners.set(key, [...(listeners.get(key) ?? []), callback]);
      return 1;
    },
    addStyle: () => {},
    notification: () => {},
    registerMenuCommand: (name, callback) => menus.set(name, callback),
    openInTab: (url) => opened.push(url)
  };
};

const fixture = async (name, url) => {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return new JSDOM(html, { url });
};

const serverClock = (getNow) => async (_url, options) => ({
  options,
  headers: { get: (name) => name.toLowerCase() === "date" ? new Date(getNow()).toUTCString() : null }
});

const configWithTargets = (...targets) => ({
  ...createDefaultConfig(),
  targets: targets.map(({ courseCode, courseName, section, category }) => ({
    id: `${courseCode}:${section}`,
    courseCode,
    courseName,
    section,
    category,
    allowDirectSelect: true,
    allowJoinWaitingList: true
  }))
});

const DEMO_MAJOR = { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001", category: "ME" };
const DEMO_TECH = { courseCode: "DEMO2001", courseName: "Example Technology Course", section: "1001", category: "ME" };
const DEMO_FREE = { courseCode: "DEMO3001", courseName: "Example Free Elective", section: "1002", category: "FE" };
const WORKER_SESSION_KEY = "bnbu.courseAssistant.workerAssignment.v1";
const COMPLIANCE_ACK_KEY = "bnbu.courseAssistant.complianceAck.v1";
const VALID_COMPLIANCE_ACK = Object.freeze({
  licenseId: "Yang-NCEL-1.0",
  noticeVersion: 1,
  accepted: true,
  acceptedAt: 1
});
const detailUrl = (base, slotId, category, targetId) => createWorkerUrl(base, {
  slotId,
  category,
  targetIds: [targetId]
}, `test-${slotId}`);

test("first v1.2.2 load blocks automatic actions until the compliance notice is accepted", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm({
    [CONTROL_KEY_V3]: { version: 3, mode: "MANUAL", running: true, generation: 7 }
  });
  gm.values.delete(COMPLIANCE_ACK_KEY);
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({
    pageWindow: dom.window,
    gm,
    autoTimers: false,
    tabId: "controller",
    now: () => now,
    fetchFn: serverClock(() => now)
  });

  await runtime.initialize();
  assert.equal((await runtime.getState()).mode, "STOPPED");
  assert.ok(dom.window.document.querySelector("#yang-compliance-dialog"));
  assert.equal(await runtime.startImmediate(), false);
  assert.equal(gm.opened.length, 0);

  const dialog = dom.window.document.querySelector("#yang-compliance-dialog");
  dialog.querySelector("[data-compliance-acceptance]").click();
  const accept = dialog.querySelector("[data-compliance-accept]");
  assert.equal(accept.disabled, false);
  accept.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.deepEqual(gm.values.get(COMPLIANCE_ACK_KEY), {
    ...VALID_COMPLIANCE_ACK,
    acceptedAt: now
  });
  assert.equal(dom.window.document.querySelector("#yang-compliance-dialog"), null);
  await runtime.startImmediate();
  assert.equal((await runtime.getState()).mode, "MANUAL");
  runtime.destroy();
});

test("persists panel layout, restores it after remount and exposes recovery menus", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm({
    [PANEL_LAYOUT_KEY]: { left: 440, top: 180, width: 360, height: 400, collapsed: false }
  });
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({
    pageWindow: dom.window,
    gm,
    autoTimers: false,
    tabId: "controller",
    now: () => now,
    fetchFn: serverClock(() => now)
  });
  await runtime.initialize();
  let root = dom.window.document.querySelector("#bnbu-course-assistant");
  assert.equal(root.style.left, "440px");
  assert.equal(root.style.width, "360px");

  gm.emitRemote(PANEL_LAYOUT_KEY, { left: 300, top: 120, width: 340, height: 380, collapsed: false });
  assert.equal(root.style.left, "300px");
  assert.equal(root.style.width, "340px");

  root.querySelector('[data-panel-action="collapse"]').click();
  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(gm.values.get(PANEL_LAYOUT_KEY).collapsed, true);

  await runtime.saveConfig(createDefaultConfig());
  root = dom.window.document.querySelector("#bnbu-course-assistant");
  assert.equal(root.dataset.collapsed, "true");

  gm.menus.get("显示/展开 Yang 面板")();
  assert.equal(root.dataset.collapsed, "false");
  gm.menus.get("重置 Yang 面板位置")();
  assert.equal(root.dataset.collapsed, "false");
  assert.notEqual(root.style.left, "300px");
  runtime.destroy();
});

test("initializes fresh v3 runtime while migrating only v2 course configuration", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const old = createDefaultConfig();
  old.version = 2;
  delete old.selectionWindows;
  const gm = createGm({
    [CONFIG_KEY_V2]: old,
    "bnbu.courseAssistant.state.v2": { version: 2, running: true },
    "bnbu.courseAssistant.state.v1": { armedUntil: Number.MAX_SAFE_INTEGER, liveAutomation: true }
  });
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({
    pageWindow: dom.window,
    gm,
    autoTimers: false,
    tabId: "controller",
    now: () => now,
    fetchFn: serverClock(() => now)
  });
  await runtime.initialize();
  assert.equal(gm.values.get(STATE_KEY_V3).version, 3);
  assert.equal(gm.values.get(STATE_KEY_V3).running, false);
  assert.equal(gm.values.get(CONFIG_KEY_V3).version, 3);
  assert.equal(gm.values.get(CONFIG_KEY_V3).selectionWindows.length, 3);
  assert.equal(gm.values.get(CONTROL_KEY_V3).mode, "STOPPED");
});

test("v1.2 migration keeps targets but replaces slow v1.1 tuning and stale workers", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const oldConfig = { ...configWithTargets(DEMO_MAJOR), actionSpacingMs: 1200, controllerHeartbeatTimeoutMs: 15000 };
  const gm = createGm({
    [CONFIG_KEY_V3]: oldConfig,
    [CONTROL_KEY_V3]: { version: 3, mode: "MANUAL", running: true, generation: 7 },
    "bnbu.courseAssistant.workerPool.v1": { "ME-1": { ownerId: "stale", heartbeatAt: Number.MAX_SAFE_INTEGER } }
  });
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  const migrated = gm.values.get(CONFIG_KEY_V3);
  assert.equal(migrated.targets[0].courseCode, "DEMO1001");
  assert.equal(migrated.actionSpacingMs, 250);
  assert.equal(migrated.maxWorkers, 6);
  assert.equal(migrated.controllerHeartbeatTimeoutMs, 60000);
  assert.deepEqual(gm.values.get("bnbu.courseAssistant.workerPool.v1"), {});
  assert.equal(gm.values.get(CONTROL_KEY_V3).mode, "STOPPED");
});

test("manual immediate start opens one dedicated worker per target and reuses opening leases", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startImmediate();
  const state = await runtime.getState();
  assert.equal(state.mode, "MANUAL");
  assert.equal(state.running, true);
  assert.equal(state.pollPhase, "BURST");
  assert.equal(gm.opened.length, 3);
  assert.deepEqual(gm.opened.map((url) => parseWorkerMarker(new URL(url)).slotId), ["ME-1", "ME-2", "FE-1"]);
  await runtime.startImmediate();
  assert.equal(gm.opened.length, 3);
});

test("manual immediate start publishes RUNNING without waiting for a hanging clock calibration", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const freshClock = { source: "BNBU_SERVER", offsetMs: 0, rttMs: 0, uncertaintyMs: 500, syncedAt: now, error: null };
  const gm = createGm({
    [MIGRATION_KEY_V12]: true,
    [CONTROL_KEY_V3]: {
      version: 3,
      generation: 1,
      mode: "STOPPED",
      running: false,
      scheduleEnabled: false,
      selectionWindows: createDefaultConfig().selectionWindows,
      clockSync: freshClock,
      pollPhase: "STOPPED"
    }
  });
  const runtime = await createAssistantRuntime({
    pageWindow: dom.window,
    gm,
    autoTimers: false,
    tabId: "controller",
    now: () => now,
    fetchFn: () => new Promise(() => {})
  });
  await runtime.initialize();
  const outcome = await Promise.race([
    runtime.startImmediate().then(() => "started"),
    new Promise((resolve) => dom.window.setTimeout(() => resolve("blocked"), 30))
  ]);
  assert.equal(outcome, "started");
  const state = await runtime.getState();
  assert.equal(state.mode, "MANUAL");
  assert.equal(state.running, true);
});

test("Test returns its local result without waiting for Worker storage or tab loading", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  const setValue = gm.setValue;
  let blockWorkerWrite = false;
  gm.setValue = (key, value) => {
    if (blockWorkerWrite && key === WORKER_POOL_KEY) return new Promise(() => {});
    return setValue(key, value);
  };
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  blockWorkerWrite = true;
  const outcome = await Promise.race([
    runtime.test().then((result) => ({ kind: "tested", result })),
    new Promise((resolve) => dom.window.setTimeout(() => resolve({ kind: "blocked" }), 30))
  ]);
  assert.equal(outcome.kind, "tested");
  assert.equal(outcome.result.reason, "controller-page");
});

test("a running manual detail page scans before an unavailable clock calibration", async () => {
  const dom = await fixture("selectable.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const now = parseBeijingDateTime("2026-07-20T10:00:00");
  let calls = 0;
  dom.window.selectItem = () => {
    calls += 1;
    return dom.window.confirm("Select Example Major Elective (1001), are you sure?");
  };
  const gm = createGm({
    [MIGRATION_KEY_V12]: true,
    [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR),
    [CONTROL_KEY_V3]: {
      version: 3,
      generation: 1,
      mode: "MANUAL",
      running: true,
      scheduleEnabled: false,
      selectionWindows: createDefaultConfig().selectionWindows,
      pollPhase: "BURST"
    }
  });
  const runtime = await createAssistantRuntime({
    pageWindow: dom.window,
    gm,
    autoTimers: false,
    tabId: "manual-tab",
    now: () => now,
    fetchFn: () => new Promise(() => {})
  });
  const outcome = await Promise.race([
    runtime.initialize().then(() => "initialized"),
    new Promise((resolve) => dom.window.setTimeout(() => resolve("blocked"), 150))
  ]);
  assert.equal(outcome, "initialized");
  assert.equal(calls, 1);
});

test("scheduled start prewarms workers at the normal three-second phase", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  const now = parseBeijingDateTime("2026-07-20T09:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now), random: () => 0.5 });
  await runtime.initialize();
  await runtime.startScheduled(createDefaultConfig().selectionWindows);
  const state = await runtime.getState();
  assert.equal(state.mode, "SCHEDULED");
  assert.equal(state.running, false);
  assert.equal(state.pollPhase, "NORMAL");
  assert.equal(state.nextReloadAt, null);
  assert.equal(state.clockSync.source, "BNBU_SERVER");
});

test("a schedule tick recovers from sleep and starts exactly inside the active round", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  let now = parseBeijingDateTime("2026-07-20T09:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startScheduled(createDefaultConfig().selectionWindows);
  now = parseBeijingDateTime("2026-07-20T10:00:00");
  await runtime.tick();
  const state = await runtime.getState();
  assert.equal(state.mode, "SCHEDULED");
  assert.equal(state.running, true);
  assert.equal(state.activeWindowId, "round-1");
  assert.equal(state.pollPhase, "BURST");
});

test("scheduled start inside an active round immediately executes a ready Select", async () => {
  const dom = await fixture("selectable.html", detailUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me", "ME-1", "ME", "DEMO1001:1001"));
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR) });
  let calls = 0;
  dom.window.selectItem = () => {
    calls += 1;
    return dom.window.confirm("Select Example Major Elective (1001), are you sure?");
  };
  const now = parseBeijingDateTime("2026-07-20T10:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "ME-worker", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startScheduled(createDefaultConfig().selectionWindows);
  assert.equal(calls, 1);
  assert.equal((await runtime.getState()).mode, "SCHEDULED");
  assert.equal((await runtime.getState()).running, true);
});

test("Test never acts while immediate start calls the ready Select page function", async () => {
  const dom = await fixture("selectable.html", detailUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me", "ME-1", "ME", "DEMO1001:1001"));
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR) });
  let calls = 0;
  dom.window.selectItem = () => {
    calls += 1;
    return dom.window.confirm("Select Example Major Elective (1001), are you sure?");
  };
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "ME-worker", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.test();
  assert.equal(calls, 0);
  await runtime.startImmediate();
  assert.equal(calls, 1);
  assert.equal((await runtime.getState()).pendingActions["DEMO1001:1001"].actionType, "SELECT");
});

test("an unmarked running detail tab becomes the foreground hot page and executes immediately", async () => {
  const dom = await fixture("selectable.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR) });
  let calls = 0;
  dom.window.selectItem = () => {
    calls += 1;
    return dom.window.confirm("Select Example Major Elective (1001), are you sure?");
  };
  const now = parseBeijingDateTime("2026-07-20T10:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "manual-tab", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startImmediate();
  assert.equal(calls, 1);
  assert.equal(dom.window.document.querySelector("#bnbu-course-assistant"), null);
  assert.match(dom.window.document.querySelector("#yang-worker-status").textContent, /前台优先页/);
});

test("an unmarked stopped detail tab identifies targets but never executes", async () => {
  const dom = await fixture("selectable.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR) });
  let calls = 0;
  dom.window.selectItem = () => { calls += 1; };
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "manual-tab", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  assert.equal(calls, 0);
  assert.equal((await runtime.getState()).courseStatuses["DEMO1001:1001"].status, "SELECTABLE");
  assert.match(dom.window.document.querySelector("#yang-worker-status").textContent, /前台优先页/);
});

test("one unmarked ME hot page scans every configured ME target", async () => {
  const dom = await fixture("hot_me_two_targets.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR, DEMO_TECH) });
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "manual-tab", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  const statuses = (await runtime.getState()).courseStatuses;
  assert.equal(statuses["DEMO1001:1001"].status, "SELECTABLE");
  assert.equal(statuses["DEMO2001:1001"].status, "WAITLIST_AVAILABLE");
  assert.equal(statuses["DEMO1001:1001"].workerSlotId, "HOT-ME");
  assert.equal(statuses["DEMO2001:1001"].workerSlotId, "HOT-ME");
});

test("a worker returning to the overview keeps its session assignment and verifies success", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const markedDetail = detailUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me", "ME-1", "ME", "DEMO1001:1001");
  dom.window.sessionStorage.setItem(WORKER_SESSION_KEY, JSON.stringify({
    marker: parseWorkerMarker(new URL(markedDetail)),
    detailUrl: markedDetail
  }));
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR) });
  const now = parseBeijingDateTime("2026-07-20T10:00:01");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "ME-worker", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  assert.equal(dom.window.document.querySelector("#bnbu-course-assistant"), null);
  assert.match(dom.window.document.querySelector("#yang-worker-status").textContent, /ME-1/);
  assert.equal((await runtime.getState()).courseStatuses["DEMO1001:1001"].status, "REGISTERED");
});

test("immediate start joins a ready waiting list without queue or credit inspection", async () => {
  const detail = await fixture("waitlist_available.html", detailUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=fe", "FE-1", "FE", "DEMO3001:1002"));
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_FREE) });
  let calls = 0;
  let detailCalls = 0;
  detail.window.viewElective = () => { detailCalls += 1; };
  detail.window.joinWaiting = () => {
    calls += 1;
    return detail.window.confirm("Join Waiting List of Example Free Elective (1002)?");
  };
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: detail.window, gm, autoTimers: false, tabId: "FE-worker", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startImmediate();
  assert.equal(calls, 1);
  assert.equal(detailCalls, 0);
  assert.equal((await runtime.getState()).pendingActions["DEMO3001:1002"].actionType, "JOIN_WAITLIST");
});

test("a rejected page action remains visibly failed and is not blindly retried", async () => {
  const dom = await fixture("selectable.html", detailUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me", "ME-1", "ME", "DEMO1001:1001"));
  const gm = createGm({ [CONFIG_KEY_V3]: configWithTargets(DEMO_MAJOR) });
  let calls = 0;
  dom.window.selectItem = () => { calls += 1; return false; };
  const now = parseBeijingDateTime("2026-07-20T10:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "ME-worker", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startImmediate();
  const failed = (await runtime.getState()).courseStatuses["DEMO1001:1001"];
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.attempts, 1);
  assert.ok(failed.retryAt > now);
  assert.equal((await runtime.getState()).running, true);
  await runtime.scan({ allowActions: true });
  assert.equal(calls, 1);
});

test("Stop and Escape cancel both manual and scheduled modes", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  const now = parseBeijingDateTime("2026-07-20T09:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startScheduled(createDefaultConfig().selectionWindows);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  const state = await runtime.getState();
  assert.equal(state.mode, "STOPPED");
  assert.equal(state.running, false);
  assert.equal(state.scheduleEnabled, false);
  assert.deepEqual(state.actionQueue, []);
});

test("stops automatically when every configured target is registered", async () => {
  const dom = await fixture("selected.html", detailUrl("https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me", "ME-1", "ME", "DEMO2001:1001"));
  const config = configWithTargets(DEMO_TECH);
  const gm = createGm({ [CONFIG_KEY_V3]: config });
  const now = parseBeijingDateTime("2026-07-20T10:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "ME-worker", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startImmediate();
  const state = await runtime.getState();
  assert.equal(state.courseStatuses["DEMO2001:1001"].status, "REGISTERED");
  assert.equal(state.mode, "STOPPED");
  assert.equal(state.running, false);
});
