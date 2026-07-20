import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = new URL("../dist/yang-bnbu-course-assistant.user.js", import.meta.url);
const source = await readFile(path, "utf8");

const requiredMatches = [
  "// @match        https://mis.bnbu.edu.cn/mis/student/es/elective.do*",
  "// @match        https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do*"
];

for (const match of requiredMatches) assert.ok(source.includes(match), `missing exact match: ${match}`);
assert.ok(source.includes("// @name         Yang 抢课脚本"), "public script name missing");
assert.ok(source.includes("// @version      1.2.3"), "dist version must be 1.2.3");
assert.ok(source.includes("// @author       Yang1107-wzy"), "public author missing");
assert.ok(source.includes("// @license      Yang-NCEL-1.0"), "non-commercial license metadata missing");
assert.ok(!source.includes("// @license      MIT"), "retired MIT metadata leaked into dist");
assert.ok(source.includes("Yang1107-wzy/yang-bnbu-course-assistant"), "GitHub project metadata missing");
assert.equal((source.match(/^\/\/ @match/gm) ?? []).length, 2, "dist must contain exactly two approved @match rules");
const retiredHostname = ["mis", "uic", "edu", "cn"].join(".");
assert.ok(!source.includes(retiredHostname), "retired MIS hostname leaked into dist");
for (const target of ["COMP3073", "COMP4213", "EBIS3113"]) {
  assert.ok(source.includes(target), `configured default target missing: ${target}`);
}
assert.match(
  source,
  /var DEFAULT_TARGETS = \[\s*target\("COMP3073", "Introduction to Robotics", "1002", "ME"\)/,
  "COMP3073 must be the current first default target"
);
assert.ok(source.includes("// @grant        unsafeWindow"), "unsafeWindow grant is required for guarded native confirm");
assert.ok(!source.includes("GM_xmlhttpRequest"), "network-bypass grant/API is forbidden");
assert.ok(!/^\/\/ @match\s+\*:\/\//m.test(source), "broad wildcard match is forbidden");
assert.ok(!/https?:\/\/(?:cdn|unpkg|jsdelivr|cdnjs)\./i.test(source), "external CDN runtime is forbidden");
assert.ok(!/timeapi|worldtimeapi|time\.google/i.test(source), "external time service leaked into dist");
assert.ok(source.includes('findAction(row, ["selectItem", "selectItemFromWaiting"])'), "approved select actions missing");
assert.ok(source.includes('findAction(row, ["joinWaiting"])'), "approved waitlist action missing");
assert.ok(source.includes('["replaceItem", "dropItem", "exitWaiting"].includes'), "forbidden-action denylist missing");
assert.ok(source.includes("Reflect.apply(pageFunction, pageWindow, [action.argument])"), "direct MIS page-function bridge missing");
assert.ok(source.includes("bnbu.courseAssistant.state.v3"), "v3 runtime state key missing");
assert.ok(source.includes("bnbu.courseAssistant.config.v3"), "v3 config key missing");
assert.ok(source.includes("bnbu.courseAssistant.control.v3"), "authoritative v3 control key missing");
assert.ok(source.includes("bnbu.courseAssistant.panelLayout.v1"), "persistent panel layout key missing");
assert.ok(source.includes("bnbu.courseAssistant.complianceAck.v1"), "compliance acknowledgement key missing");
assert.ok(source.includes("Yang-NCEL-1.0"), "compliance license id missing");
assert.ok(source.includes("requireCompliance"), "automatic-action compliance gate missing");
assert.ok(source.includes("bnbu.courseAssistant.workerPool.v2"), "category worker pool key missing");
assert.ok(source.includes("yang-worker"), "stable worker URL marker missing");
assert.ok(source.includes("clock-sync-timeout"), "bounded BNBU clock calibration missing");
assert.ok(source.includes("reserveWorkerOpenings"), "batch Worker reservation missing");
assert.ok(source.includes("HOT-"), "manual foreground hot-page source missing");
assert.ok(
  source.includes("\\u663E\\u793A/\\u5C55\\u5F00 Yang \\u9762\\u677F")
    && source.includes("\\u91CD\\u7F6E Yang \\u9762\\u677F\\u4F4D\\u7F6E"),
  "panel recovery menus missing"
);
assert.ok(!source.includes("bnbu.courseAssistant.state.v2"), "v2 running state leaked into dist");
assert.ok(!source.includes("bnbu.courseAssistant.control.v2"), "v2 control state leaked into dist");
assert.ok(source.includes('method: "HEAD"') && source.includes('credentials: "same-origin"'), "same-origin BNBU clock calibration missing");
assert.ok(source.includes("2026-07-20T10:00:00") && source.includes("2026-07-22T18:00:00"), "official selection windows missing");
assert.match(source, /NORMAL:\s*\[(?:3000|3e3),\s*(?:3000|3e3)\]/, "three-second normal polling missing");
assert.match(source, /BURST:\s*\[(?:1000|1e3),\s*(?:1000|1e3)\]/, "one-second burst polling missing");
assert.ok(source.includes("actionSpacingMs: 250"), "250ms action spacing missing");
assert.ok(source.includes("maxWorkers: 2"), "two-category worker bound missing");
assert.ok(source.includes("worker-open-timeout"), "bounded Worker opening failure missing");
assert.ok(source.includes("categoryCoverageIsHealthy"), "category-level Worker coverage missing");
assert.match(source, /controllerHeartbeatTimeoutMs:\s*(?:60000|6e4)/, "sixty-second worker heartbeat missing");
assert.ok(!source.includes("dependency-not-occupied"), "old course dependency leaked into dist");
assert.ok(!source.includes("waitlist-count-exceeds-limit"), "waitlist count gate leaked into dist");
assert.ok(!source.includes("category-credit-cap-exceeded"), "credit cap gate leaked into dist");
assert.ok(!source.includes("category-credit-cap-unknown"), "credit availability gate leaked into dist");
assert.ok(!source.includes("element.click()"), "failed DOM click execution path leaked into dist");
assert.ok(!source.includes("武装全自动"), "old armed UI leaked into dist");
assert.ok(source.includes("Yang 抢课脚本"), "branded panel title missing");
for (const [plain, escaped] of [
  ["仅供学习交流", "\\u4EC5\\u4F9B\\u5B66\\u4E60\\u4EA4\\u6D41"],
  ["禁止商业使用", "\\u7981\\u6B62\\u5546\\u4E1A\\u4F7F\\u7528"],
  ["不得用于学校正式选课", "\\u4E0D\\u5F97\\u7528\\u4E8E\\u5B66\\u6821\\u6B63\\u5F0F\\u9009\\u8BFE"],
  ["中国法律法规及学校规定", "\\u4E2D\\u56FD\\u6CD5\\u5F8B\\u6CD5\\u89C4\\u53CA\\u5B66\\u6821\\u89C4\\u5B9A"]
]) {
  assert.ok(source.includes(plain) || source.includes(escaped), `compliance notice missing: ${plain}`);
}
assert.ok(source.includes("\\u795D\\u60A8\\u62A2\\u5230\\u5FC3\\u4EEA\\u8BFE\\u7A0B"), "course-selection blessing missing");
for (const action of ["test", "start-immediate", "start-scheduled", "stop", "settings"]) {
  assert.ok(source.includes(action), `missing v3 UI action: ${action}`);
}

console.log(`dist safety check passed (${source.length} bytes)`);
