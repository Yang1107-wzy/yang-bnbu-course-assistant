import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const metadata = `// ==UserScript==
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
// ==/UserScript==`;

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/yang-bnbu-course-assistant.user.js"],
  outfile: "dist/yang-bnbu-course-assistant.user.js.tmp",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome100"],
  minify: false,
  legalComments: "none"
});

const bundled = await readFile("dist/yang-bnbu-course-assistant.user.js.tmp", "utf8");
await writeFile("dist/yang-bnbu-course-assistant.user.js", `${metadata}\n\n${bundled}`, "utf8");
await unlink("dist/yang-bnbu-course-assistant.user.js.tmp");
