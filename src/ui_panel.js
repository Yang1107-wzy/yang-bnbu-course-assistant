import { createPanelLayoutController } from "./panel_layout.js";
import { COMPLIANCE_NOTICE_ITEMS, COMPLIANCE_SHORT_NOTICE } from "./compliance.js";

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
#bnbu-course-assistant .ca-compliance-footer{flex:none;padding:7px 11px 9px;border-top:1px solid #92400e;background:#292014}
#bnbu-course-assistant .ca-compliance-warning{color:#fde68a;font-size:11px;font-weight:700;text-align:center;line-height:1.3}
#bnbu-course-assistant .ca-compliance-link{display:block;margin:5px auto 0;padding:3px 8px;background:#78350f;color:#fef3c7;font-size:11px}
#bnbu-course-assistant .ca-editor{padding:10px 12px;border-top:1px solid #4a4b50}
#bnbu-course-assistant .ca-editor-title{font-weight:750;margin:4px 0 7px}
#bnbu-course-assistant .ca-target-row{display:grid;grid-template-columns:82px 1fr 56px 50px 28px;gap:5px;margin-bottom:6px}
#bnbu-course-assistant .ca-window-row{display:grid;grid-template-columns:24px 58px 1fr 1fr;gap:5px;margin-bottom:6px;align-items:center}
#bnbu-course-assistant .ca-target-row input,#bnbu-course-assistant .ca-target-row select,#bnbu-course-assistant .ca-window-row input{width:100%;min-width:0}
#bnbu-course-assistant .ca-target-row button{padding:4px;background:#6a3032;color:white}
#bnbu-course-assistant .ca-editor-actions{display:flex;gap:7px;margin-top:8px}
#bnbu-course-assistant .ca-resize{position:absolute;right:2px;bottom:2px;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 0 45%,#a8a8ad 46% 54%,transparent 55% 65%,#a8a8ad 66% 74%,transparent 75%);opacity:.8}
#bnbu-course-assistant[data-collapsed="true"]{border-radius:22px}
#bnbu-course-assistant[data-collapsed="true"] .ca-body,#bnbu-course-assistant[data-collapsed="true"] .ca-compliance-footer,#bnbu-course-assistant[data-collapsed="true"] .ca-resize,#bnbu-course-assistant[data-collapsed="true"] .ca-title-full,#bnbu-course-assistant[data-collapsed="true"] .ca-state,#bnbu-course-assistant[data-collapsed="true"] .ca-collapse{display:none}
#bnbu-course-assistant[data-collapsed="true"] .ca-title-short,#bnbu-course-assistant[data-collapsed="true"] .ca-state-short,#bnbu-course-assistant[data-collapsed="true"] .ca-expand{display:inline-flex}
#bnbu-course-assistant[data-collapsed="true"] .ca-head{height:100%;box-sizing:border-box;padding:7px 9px;border:0}
#bnbu-course-assistant .ca-state-short{width:9px;height:9px;border-radius:50%;background:#ffcc66}
#bnbu-course-assistant[data-running="true"] .ca-state-short{background:#4ade80}
#bnbu-course-assistant[data-mode="SCHEDULED"] .ca-state-short{background:#93c5fd}
#bnbu-course-assistant[data-error="true"] .ca-state-short{background:#ff4d4f}
#yang-compliance-dialog{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;background:rgba(0,0,0,.72);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#yang-compliance-dialog .ca-compliance-card{width:min(560px,100%);max-height:min(720px,calc(100vh - 36px));display:flex;flex-direction:column;overflow:hidden;border:2px solid #f59e0b;border-radius:14px;background:#1f2024;color:#f8fafc;box-shadow:0 18px 60px rgba(0,0,0,.55)}
#yang-compliance-dialog .ca-compliance-title{padding:15px 17px;border-bottom:1px solid #52525b;color:#fde68a;font-size:18px;font-weight:800}
#yang-compliance-dialog .ca-compliance-scroll{margin:14px 16px 8px;padding:12px 14px;min-height:180px;max-height:44vh;overflow:auto;border:1px solid #52525b;border-radius:8px;background:#18181b}
#yang-compliance-dialog .ca-compliance-scroll li{margin:0 0 10px}
#yang-compliance-dialog .ca-compliance-license{color:#fbbf24;font-weight:700}
#yang-compliance-dialog .ca-compliance-check{display:flex;align-items:flex-start;gap:8px;margin:8px 16px;color:#fef3c7;font-weight:700}
#yang-compliance-dialog .ca-compliance-check input{margin-top:4px}
#yang-compliance-dialog .ca-compliance-actions{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px 16px}
#yang-compliance-dialog button{border:0;border-radius:8px;padding:9px 14px;cursor:pointer;font-weight:750}
#yang-compliance-dialog [data-compliance-accept]{background:#f59e0b;color:#1c1917}
#yang-compliance-dialog [data-compliance-accept]:disabled{cursor:not-allowed;opacity:.45}
#yang-worker-status{position:fixed;right:12px;top:12px;z-index:2147483646;max-width:290px;padding:8px 10px;border-radius:9px;background:rgba(30,30,32,.94);color:#f5f5f5;border:1px solid #58595f;box-shadow:0 5px 18px rgba(0,0,0,.28);font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none}
#yang-worker-status .ca-worker-title{font-weight:800;color:#93c5fd;margin-bottom:4px}
#yang-worker-status .ca-worker-target{margin-top:3px}
#yang-worker-status .ca-worker-state{color:#ffd666}
#yang-worker-status .ca-worker-purpose{margin-top:4px;color:#fbbf24;font-weight:700}
#yang-worker-status[data-complete="true"]{border-color:#4ade80}
#yang-worker-status[data-error="true"]{border-color:#ff5a5f}
`;

export const createComplianceDialog = (document, { required = true, onAccept, onClose } = {}) => {
  document.querySelector("#yang-compliance-dialog")?.remove();
  const root = element(document, "div");
  root.id = "yang-compliance-dialog";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Yang 抢课脚本使用声明与许可证");

  const card = element(document, "section", "ca-compliance-card");
  card.append(element(document, "div", "ca-compliance-title", "使用声明与许可证（请完整阅读）"));
  const scroll = element(document, "div", "ca-compliance-scroll");
  scroll.dataset.complianceScroll = "true";
  scroll.tabIndex = 0;
  scroll.append(element(document, "p", "ca-compliance-license", "Yang-NCEL-1.0｜仅供学习交流｜禁止商业使用"));
  const list = element(document, "ol");
  for (const item of COMPLIANCE_NOTICE_ITEMS) list.append(element(document, "li", "", item));
  scroll.append(list, element(document, "p", "", "继续使用即表示你理解本项目的许可限制、安全边界与风险。"));
  card.append(scroll);

  let acceptance = null;
  let accept = null;
  let scrolledToEnd = !required;
  const updateAccept = () => {
    if (accept) accept.disabled = required && !(scrolledToEnd && acceptance.checked);
  };

  if (required) {
    const check = element(document, "label", "ca-compliance-check");
    acceptance = element(document, "input");
    acceptance.type = "checkbox";
    acceptance.dataset.complianceAcceptance = "true";
    check.append(acceptance, element(document, "span", "", "我已阅读、理解并同意以上限制"));
    card.append(check);
    scroll.addEventListener("scroll", () => {
      scrolledToEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1;
      updateAccept();
    });
    acceptance.addEventListener("change", updateAccept);
  }

  const actions = element(document, "div", "ca-compliance-actions");
  if (!required) {
    const close = element(document, "button", "", "关闭");
    close.type = "button";
    close.dataset.complianceClose = "true";
    close.addEventListener("click", () => {
      root.remove();
      onClose?.();
    });
    actions.append(close);
  } else {
    accept = element(document, "button", "", "确认并继续");
    accept.type = "button";
    accept.dataset.complianceAccept = "true";
    accept.disabled = true;
    accept.addEventListener("click", async () => {
      if (accept.disabled) return;
      accept.disabled = true;
      await onAccept?.();
      root.remove();
    });
    actions.append(accept);
  }
  card.append(actions);
  root.append(card);
  document.body.append(root);
  return { root, destroy: () => root.remove() };
};

const targetKey = (target) => target.id ?? `${target.courseCode}:${target.section}`;
const STATUS_LABELS = Object.freeze({
  OPENING: "正在打开 Worker",
  SCANNING: "高速扫描中",
  NOT_FOUND: "当前页面未找到",
  UNKNOWN: "暂不可选",
  TIME_CONFLICT: "时间冲突",
  SELECTABLE: "可直接选择",
  WAITLIST_AVAILABLE: "可加入轮候",
  SUBMITTING: "正在提交",
  WAITING: "已加入轮候",
  REGISTERED: "已抢到",
  FAILED: "执行失败",
  ERROR: "执行失败",
  WORKER_OFFLINE: "Worker 失联"
});

const statusText = (current) => {
  if (!current) return "未扫描";
  const pieces = [STATUS_LABELS[current.status] ?? current.status];
  if (current.workerSlotId?.startsWith("HOT-")) pieces.push(`前台页 ${current.workerSlotId.slice(4)}`);
  else if (current.workerSlotId) pieces.push(`Worker ${current.workerSlotId}`);
  if (current.actionType) pieces.push(current.actionType);
  if (Number.isFinite(current.attempts) && current.attempts > 0) pieces.push(`尝试 ${current.attempts}`);
  if (current.reason && current.reason !== STATUS_LABELS[current.status]) pieces.push(current.reason);
  if (current.scannedAt) pieces.push(current.scannedAt);
  return pieces.join(" · ");
};

export const createWorkerStatusBar = (document, { slot, targets = [], observerOnly = false, hotPage = false }) => {
  document.querySelector("#yang-worker-status")?.remove();
  const root = element(document, "aside");
  root.id = "yang-worker-status";
  const titleText = observerOnly
    ? "Yang · 非 Worker，可关闭"
    : hotPage
      ? `Yang 前台优先页 · ${slot.category}`
      : `Yang Worker · ${slot.slotId}`;
  const title = element(document, "div", "ca-worker-title", titleText);
  const targetRefs = new Map();
  root.append(title, element(document, "div", "ca-worker-purpose", "学习测试用途"));
  if (!observerOnly) {
    for (const id of slot.targetIds) {
      const target = targets.find((item) => targetKey(item) === id);
      const row = element(document, "div", "ca-worker-target");
      row.append(element(document, "div", "", target ? `${target.courseCode} (${target.section})` : id));
      const state = element(document, "div", "ca-worker-state", "正在打开 Worker");
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
    destroy() { root.remove(); }
  };
};

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
  root.title = COMPLIANCE_SHORT_NOTICE;

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
  const complianceFooter = element(document, "div", "ca-compliance-footer");
  complianceFooter.dataset.complianceFooter = "true";
  const complianceButton = element(document, "button", "ca-compliance-link", "查看使用声明与许可证");
  complianceButton.type = "button";
  complianceButton.dataset.action = "compliance-notice";
  complianceFooter.append(element(document, "div", "ca-compliance-warning", COMPLIANCE_SHORT_NOTICE), complianceButton);
  body.append(message, element(document, "div", "ca-blessing", "祝您抢到心仪课程"));
  const resizeHandle = element(document, "div", "ca-resize");
  resizeHandle.dataset.resizeHandle = "true";
  resizeHandle.title = "拖动调整面板大小";
  root.append(body, complianceFooter, resizeHandle);
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
  complianceButton.addEventListener("click", () => callbacks.showComplianceNotice?.());
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
