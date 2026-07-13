import { createPanelLayoutController } from "./panel_layout.js";

const element = (document, tag, className = "", text = undefined) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const PANEL_CSS = `
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
`;

const targetKey = (target) => target.id ?? `${target.courseCode}:${target.section}`;

const createTargetEditorRow = (document, editor, target = {}) => {
  const row = element(document, "div", "ca-target-row");
  row.dataset.targetRow = "true";
  for (const [name, placeholder] of [["courseCode", "课程代码"], ["courseName", "课程名称"], ["section", "班号"]]) {
    const input = element(document, "input");
    input.dataset.targetField = name;
    input.placeholder = placeholder;
    input.value = target[name] ?? "";
    row.append(input);
  }
  const category = element(document, "select");
  category.dataset.targetField = "category";
  for (const value of ["ME", "FE"]) {
    const option = element(document, "option", "", value);
    option.value = value;
    category.append(option);
  }
  category.value = target.category ?? "ME";
  row.append(category);
  const remove = element(document, "button", "", "×");
  remove.type = "button";
  remove.addEventListener("click", () => row.remove());
  row.append(remove);
  editor.append(row);
};

const createWindowEditorRow = (document, editor, window) => {
  const row = element(document, "div", "ca-window-row");
  row.dataset.windowRow = "true";
  row.dataset.windowId = window.id;
  const enabled = element(document, "input");
  enabled.type = "checkbox";
  enabled.checked = window.enabled !== false;
  enabled.dataset.windowField = "enabled";
  const label = element(document, "input");
  label.value = window.label;
  label.dataset.windowField = "label";
  const start = element(document, "input");
  start.type = "datetime-local";
  start.step = "1";
  start.value = window.startText;
  start.dataset.windowField = "startText";
  const end = element(document, "input");
  end.type = "datetime-local";
  end.step = "1";
  end.value = window.endText;
  end.dataset.windowField = "endText";
  row.append(enabled, label, start, end);
  editor.append(row);
};

const readTargets = (editor) => Array.from(editor.querySelectorAll("[data-target-row]")).map((row) => ({
  courseCode: row.querySelector('[data-target-field="courseCode"]').value,
  courseName: row.querySelector('[data-target-field="courseName"]').value,
  section: row.querySelector('[data-target-field="section"]').value,
  category: row.querySelector('[data-target-field="category"]').value
}));

const readWindows = (editor) => Array.from(editor.querySelectorAll("[data-window-row]")).map((row) => ({
  id: row.dataset.windowId,
  label: row.querySelector('[data-window-field="label"]').value,
  enabled: row.querySelector('[data-window-field="enabled"]').checked,
  startText: row.querySelector('[data-window-field="startText"]').value.replace(/\.000$/, ""),
  endText: row.querySelector('[data-window-field="endText"]').value.replace(/\.000$/, "")
}));

const timeRow = (document, label, field) => {
  const row = element(document, "div", "ca-time-row");
  row.append(element(document, "span", "", label));
  const value = element(document, "span", "ca-time-value", "—");
  value.dataset.field = field;
  row.append(value);
  return { row, value };
};

export const createPanel = (document, { config, callbacks, layout = {} }) => {
  document.querySelector("#bnbu-course-assistant")?.remove();
  const root = element(document, "section");
  root.id = "bnbu-course-assistant";
  root.dataset.running = "false";
  root.dataset.mode = "STOPPED";
  root.dataset.error = "false";

  const head = element(document, "div", "ca-head");
  const titles = element(document, "div", "ca-head-title");
  titles.append(
    element(document, "span", "ca-title-full", "Yang 抢课脚本"),
    element(document, "span", "ca-title-short", "Yang")
  );
  const stateLabel = element(document, "span", "ca-state", "STOPPED");
  const stateShort = element(document, "span", "ca-state-short");
  stateShort.title = "STOPPED";
  const collapse = element(document, "button", "ca-collapse", "—");
  collapse.type = "button";
  collapse.title = "收起面板";
  collapse.dataset.panelAction = "collapse";
  const expand = element(document, "button", "ca-expand", "↗");
  expand.type = "button";
  expand.title = "展开面板";
  expand.dataset.panelAction = "expand";
  const headControls = element(document, "div", "ca-head-controls");
  headControls.append(stateLabel, stateShort, collapse, expand);
  head.append(titles, headControls);
  root.append(head);

  const body = element(document, "div", "ca-body");
  body.dataset.panelBody = "true";

  const time = element(document, "div", "ca-time");
  const beijingClock = timeRow(document, "北京时间", "beijing-clock");
  const clockSync = timeRow(document, "校时", "clock-sync");
  const nextWindow = timeRow(document, "下一窗口", "next-window");
  const pollPhase = timeRow(document, "轮询", "poll-phase");
  time.append(beijingClock.row, clockSync.row, nextWindow.row, pollPhase.row);
  body.append(time);

  const actions = element(document, "div", "ca-actions");
  for (const [action, label] of [
    ["test", "Test"],
    ["start-immediate", "立即启动"],
    ["start-scheduled", "预约启动"],
    ["stop", "Stop"],
    ["settings", "设置"]
  ]) {
    const button = element(document, "button", "", label);
    button.type = "button";
    button.dataset.action = action;
    actions.append(button);
  }
  body.append(actions);

  const courses = element(document, "div", "ca-courses");
  const courseRefs = new Map();
  for (const target of config.targets) {
    const card = element(document, "div", "ca-course");
    const key = targetKey(target);
    card.dataset.courseKey = key;
    card.append(element(document, "div", "ca-course-title", `${target.courseCode} (${target.section}) — ${target.courseName}`));
    const status = element(document, "div", "ca-course-status", "未扫描");
    card.append(status);
    courses.append(card);
    courseRefs.set(key, status);
  }
  body.append(courses);

  const editor = element(document, "div", "ca-editor");
  editor.dataset.settingsEditor = "true";
  editor.hidden = true;
  editor.append(element(document, "div", "ca-editor-title", "目标课程"));
  for (const target of config.targets) createTargetEditorRow(document, editor, target);
  const add = element(document, "button", "", "+ 添加课程");
  add.type = "button";
  add.dataset.editorAction = "add";
  add.addEventListener("click", () => createTargetEditorRow(document, editor));
  editor.append(add, element(document, "div", "ca-editor-title", "北京时间窗口"));
  for (const window of config.selectionWindows) createWindowEditorRow(document, editor, window);
  const save = element(document, "button", "", "保存设置");
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

  const message = element(document, "div", "ca-message", "点击 Test 检查，或选择立即/预约启动");
  body.append(message, element(document, "div", "ca-blessing", "祝您抢到心仪课程"));
  const resizeHandle = element(document, "div", "ca-resize");
  resizeHandle.dataset.resizeHandle = "true";
  resizeHandle.title = "拖动调整面板大小";
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
  root.querySelector('[data-action="settings"]').addEventListener("click", () => { editor.hidden = !editor.hidden; });
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
      beijingClock.value.textContent = view.beijingNowText ?? "—";
      clockSync.value.textContent = view.clockSyncText ?? "本机时钟";
      nextWindow.value.textContent = view.nextWindowText ?? "—";
      pollPhase.value.textContent = view.pollPhaseText ?? "STOPPED";
      message.textContent = view.message ?? "";
      for (const [key, status] of courseRefs) {
        const current = view.courseStatuses?.[key];
        status.textContent = current
          ? `${current.status}${current.reason ? ` — ${current.reason}` : ""}${current.scannedAt ? ` · ${current.scannedAt}` : ""}`
          : "未找到";
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
