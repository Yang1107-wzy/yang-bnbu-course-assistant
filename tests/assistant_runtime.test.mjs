import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  CONFIG_KEY_V2,
  CONFIG_KEY_V3,
  CONTROL_KEY_V3,
  STATE_KEY_V3,
  createAssistantRuntime
} from "../src/assistant_runtime.js";
import { createDefaultConfig } from "../src/config_manager.js";
import { parseBeijingDateTime } from "../src/time_scheduler.js";

const createGm = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  const opened = [];
  const listeners = new Map();
  return {
    values,
    opened,
    getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    setValue: (key, value) => {
      const old = values.get(key);
      values.set(key, value);
      for (const callback of listeners.get(key) ?? []) callback(key, old, value, false);
    },
    deleteValue: (key) => values.delete(key),
    addValueChangeListener: (key, callback) => {
      listeners.set(key, [...(listeners.get(key) ?? []), callback]);
      return 1;
    },
    addStyle: () => {},
    notification: () => {},
    registerMenuCommand: () => {},
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

test("manual immediate start runs outside every window and opens ME/FE workers", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  const now = parseBeijingDateTime("2026-07-13T16:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now) });
  await runtime.initialize();
  await runtime.startImmediate();
  const state = await runtime.getState();
  assert.equal(state.mode, "MANUAL");
  assert.equal(state.running, true);
  assert.equal(state.pollPhase, "FAST");
  assert.deepEqual(gm.opened, [
    "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me-category",
    "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=fe-category"
  ]);
});

test("scheduled start waits without reload work when the next round is more than ten minutes away", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const gm = createGm();
  const now = parseBeijingDateTime("2026-07-20T09:00:00");
  const runtime = await createAssistantRuntime({ pageWindow: dom.window, gm, autoTimers: false, tabId: "controller", now: () => now, fetchFn: serverClock(() => now), random: () => 0.5 });
  await runtime.initialize();
  await runtime.startScheduled(createDefaultConfig().selectionWindows);
  const state = await runtime.getState();
  assert.equal(state.mode, "SCHEDULED");
  assert.equal(state.running, false);
  assert.equal(state.pollPhase, "WAITING");
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
  assert.equal(state.pollPhase, "FAST");
});

test("scheduled start inside an active round immediately executes a ready Select", async () => {
  const dom = await fixture("selectable.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const gm = createGm();
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
  const dom = await fixture("selectable.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const gm = createGm();
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

test("immediate start joins a ready waiting list without queue or credit inspection", async () => {
  const detail = await fixture("waitlist_available.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=fe");
  const gm = createGm();
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
  const dom = await fixture("selected.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me");
  const config = createDefaultConfig();
  config.targets = [config.targets[1]];
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
