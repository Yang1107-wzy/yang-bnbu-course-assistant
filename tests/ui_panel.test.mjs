import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createDefaultConfig } from "../src/config_manager.js";
import { createPanel } from "../src/ui_panel.js";

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
    "settings"
  ]);
  assert.match(root.textContent, /立即启动/);
  assert.match(root.textContent, /预约启动/);
  assert.ok(root.querySelector('[data-field="beijing-clock"]'));
  assert.ok(root.querySelector('[data-field="clock-sync"]'));
  assert.ok(root.querySelector('[data-field="next-window"]'));
  assert.ok(root.querySelector('[data-field="poll-phase"]'));
  assert.equal(root.querySelector('[data-field="poll-interval"]'), null);
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
    pollPhaseText: "FAST · 1.5–2.5 秒",
    message: "等待第一轮",
    courseStatuses: {}
  });
  assert.match(panel.root.textContent, /SCHEDULED/);
  assert.match(panel.root.textContent, /2026-07-20 09:59:50/);
  assert.match(panel.root.textContent, /BNBU SERVER/);
  assert.match(panel.root.textContent, /第一轮 · 10 秒/);
  assert.match(panel.root.textContent, /FAST · 1.5–2.5 秒/);

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
