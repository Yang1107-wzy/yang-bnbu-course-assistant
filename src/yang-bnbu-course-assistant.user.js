import { createAssistantRuntime } from "./assistant_runtime.js";

const gm = {
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
      title: "Yang 抢课脚本启动失败",
      text: "请打开控制台查看错误；脚本未执行任何选课动作。",
      timeout: 10000
    });
  } catch {
    // Console output remains available when notifications are unavailable.
  }
});
