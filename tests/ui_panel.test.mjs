import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createDefaultConfig } from "../src/config_manager.js";
import { createPanel, createWorkerStatusBar } from "../src/ui_panel.js";

const setup = (callbacks = {}, layout = undefined) => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const config = createDefaultConfig();
  const panel = createPanel(dom.window.document, { config, callbacks, layout });
  return { dom, config, panel };
};

test("renders compact time status and exactly two start paths", () => {
  const { dom } = setup();
  const root = dom.window.document.querySelector("#bnbu-course-assistant");
  assert.ok(root);
  assert.deepEqual(Array.from(root.querySelectorAll("[data-action]")).map((node) => node.dataset.action), [
    "test",
    "start-immediate",
    "start-scheduled",
    "stop",
    "settings",
    "compliance-notice"
  ]);
  assert.match(root.textContent, /立即启动/);
  assert.match(root.textContent, /预约启动/);
  assert.ok(root.querySelector('[data-field="beijing-clock"]'));
  assert.ok(root.querySelector('[data-field="clock-sync"]'));
  assert.ok(root.querySelector('[data-field="next-window"]'));
  assert.ok(root.querySelector('[data-field="poll-phase"]'));
  assert.equal(root.querySelector('[data-field="poll-interval"]'), null);
});

test("keeps the non-commercial learning-use notice visible and reopens the full notice", () => {
  const calls = [];
  const { panel } = setup({ showComplianceNotice: () => calls.push("notice") });
  assert.match(panel.root.textContent, /仅供学习交流/);
  assert.match(panel.root.textContent, /禁止商业使用/);
  assert.match(panel.root.textContent, /不得用于学校正式选课/);
  assert.match(panel.root.textContent, /中国法律法规及学校规定/);
  const footer = panel.root.querySelector("[data-compliance-footer]");
  assert.ok(footer);
  assert.equal(footer.parentElement, panel.root);
  assert.notEqual(footer.parentElement, panel.root.querySelector("[data-panel-body]"));
  panel.root.querySelector('[data-action="compliance-notice"]').click();
  assert.deepEqual(calls, ["notice"]);
  assert.match(panel.root.title, /仅供学习交流.*禁止商业使用.*不得用于学校正式选课/s);
});

test("exposes an independent draggable, resizable and collapsible panel shell", () => {
  const changes = [];
  const { panel } = setup({}, {
    initial: { left: 500, top: 200, width: 380, height: 420, collapsed: false },
    onChange: (layout) => changes.push(layout)
  });
  assert.ok(panel.root.querySelector("[data-panel-body]"));
  assert.ok(panel.root.querySelector("[data-resize-handle]"));
  panel.root.querySelector('[data-panel-action="collapse"]').click();
  assert.equal(panel.root.dataset.collapsed, "true");
  assert.equal(panel.getLayout().collapsed, true);
  assert.equal(changes.at(-1).collapsed, true);

  panel.root.querySelector('[data-panel-action="expand"]').click();
  assert.equal(panel.root.dataset.collapsed, "false");
  assert.equal(panel.getLayout().width, 380);
  panel.destroy();
});

test("invokes immediate, scheduled, Stop and Test independently", () => {
  const calls = [];
  const { dom } = setup({
    test: () => calls.push("test"),
    startImmediate: () => calls.push("immediate"),
    startScheduled: (windows) => calls.push(["scheduled", windows.length]),
    stop: () => calls.push("stop")
  });
  const root = dom.window.document.querySelector("#bnbu-course-assistant");
  for (const action of ["test", "start-immediate", "start-scheduled", "stop"]) {
    root.querySelector(`[data-action="${action}"]`).click();
  }
  assert.deepEqual(calls, ["test", "immediate", ["scheduled", 3], "stop"]);
});

test("shows SCHEDULED/RUNNING state, calibrated Beijing time and next round", () => {
  const { panel } = setup();
  panel.update({
    mode: "SCHEDULED",
    running: false,
    error: false,
    beijingNowText: "2026-07-20 09:59:50",
    clockSyncText: "BNBU SERVER · +120ms · ±600ms",
    nextWindowText: "第一轮 · 10 秒",
    pollPhaseText: "BURST · 1 秒",
    message: "等待第一轮",
    courseStatuses: {}
  });
  assert.match(panel.root.textContent, /SCHEDULED/);
  assert.match(panel.root.textContent, /2026-07-20 09:59:50/);
  assert.match(panel.root.textContent, /BNBU SERVER/);
  assert.match(panel.root.textContent, /第一轮 · 10 秒/);
  assert.match(panel.root.textContent, /BURST · 1 秒/);

  panel.update({ mode: "MANUAL", running: true, error: false, courseStatuses: {} });
  assert.match(panel.root.textContent, /RUNNING/);
});

test("edits courses and all three selection windows inside one collapsed settings area", () => {
  const saved = [];
  const { dom, panel } = setup({ saveConfig: (config) => saved.push(config) });
  const root = panel.root;
  const editor = root.querySelector("[data-settings-editor]");
  assert.equal(editor.hidden, true);
  root.querySelector('[data-action="settings"]').click();
  assert.equal(editor.hidden, false);
  assert.equal(editor.querySelectorAll("[data-target-row]").length, 3);
  assert.equal(editor.querySelectorAll("[data-window-row]").length, 3);

  const firstWindow = editor.querySelector("[data-window-row]");
  firstWindow.querySelector('[data-window-field="enabled"]').checked = false;
  firstWindow.querySelector('[data-window-field="startText"]').value = "2026-07-20T10:00:01";
  editor.querySelector('[data-editor-action="save"]').click();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].selectionWindows[0].enabled, false);
  assert.equal(saved[0].selectionWindows[0].startText, "2026-07-20T10:00:01");
  assert.equal(saved[0].targets.length, 3);
  assert.equal(dom.window.document.querySelectorAll("#bnbu-course-assistant").length, 1);
});

test("renders worker assignment and precise target outcome metadata in controller cards", () => {
  const { panel } = setup();
  panel.update({
    mode: "MANUAL",
    running: true,
    error: false,
    courseStatuses: {
      "COMP3073:1002": {
        status: "WAITING",
        workerSlotId: "ME-1",
        reason: "已加入轮候",
        actionType: "JOIN_WAITLIST",
        attempts: 1,
        scannedAt: "10:00:01"
      }
    }
  });
  const card = panel.root.querySelector('[data-course-key="COMP3073:1002"]');
  assert.match(card.textContent, /已加入轮候/);
  assert.match(card.textContent, /ME-1/);
  assert.match(card.textContent, /JOIN_WAITLIST/);
  assert.match(card.textContent, /10:00:01/);
});

test("controller cards label a manual hot-page source as foreground instead of Worker", () => {
  const { panel } = setup();
  panel.update({
    mode: "MANUAL",
    running: true,
    error: false,
    courseStatuses: {
      "COMP3073:1002": {
        status: "SELECTABLE",
        workerSlotId: "HOT-ME",
        reason: "可直接选",
        scannedAt: "10:00:00"
      }
    }
  });
  const card = panel.root.querySelector('[data-course-key="COMP3073:1002"]');
  assert.match(card.textContent, /前台页 ME/);
  assert.doesNotMatch(card.textContent, /Worker HOT-ME/);
});

test("worker pages render only a read-only mini status bar", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const mini = createWorkerStatusBar(dom.window.document, {
    slot: { slotId: "ME-1", category: "ME", targetIds: ["COMP3073:1002"] },
    targets: createDefaultConfig().targets
  });
  mini.update({
    courseStatuses: {
      "COMP3073:1002": { status: "REGISTERED", reason: "已抢到", scannedAt: "10:00:02" }
    }
  });
  assert.match(mini.root.textContent, /Yang Worker · ME-1/);
  assert.match(mini.root.textContent, /COMP3073 \(1002\)/);
  assert.match(mini.root.textContent, /已抢到/);
  assert.match(mini.root.textContent, /学习测试用途/);
  assert.equal(mini.root.querySelector("button"), null);
  assert.equal(dom.window.document.querySelector("#bnbu-course-assistant"), null);
});

test("a manually opened detail page renders a read-only foreground hot-page bar", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const mini = createWorkerStatusBar(dom.window.document, {
    slot: { slotId: "HOT-ME", category: "ME", targetIds: ["COMP3073:1002", "COMP4213:1001"] },
    targets: createDefaultConfig().targets,
    hotPage: true
  });
  assert.match(mini.root.textContent, /Yang 前台优先页 · ME/);
  assert.match(mini.root.textContent, /COMP3073/);
  assert.match(mini.root.textContent, /COMP4213/);
  assert.equal(mini.root.querySelector("button"), null);
});
