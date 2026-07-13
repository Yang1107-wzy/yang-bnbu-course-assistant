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
assert.ok(source.includes("// @version      1.1.0"), "dist version must be 1.1.0");
assert.ok(source.includes("// @author       Yang1107-wzy"), "public author missing");
assert.ok(source.includes("// @license      MIT"), "MIT metadata missing");
assert.ok(source.includes("Yang1107-wzy/yang-bnbu-course-assistant"), "GitHub project metadata missing");
assert.equal((source.match(/^\/\/ @match/gm) ?? []).length, 2, "dist must contain exactly two approved @match rules");
const retiredHostname = ["mis", "uic", "edu", "cn"].join(".");
assert.ok(!source.includes(retiredHostname), "retired MIS hostname leaked into dist");
for (const target of ["AI3133", "COMP4213", "EBIS3113"]) {
  assert.ok(source.includes(target), `configured default target missing: ${target}`);
}
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
assert.ok(
  source.includes("\\u663E\\u793A/\\u5C55\\u5F00 Yang \\u9762\\u677F")
    && source.includes("\\u91CD\\u7F6E Yang \\u9762\\u677F\\u4F4D\\u7F6E"),
  "panel recovery menus missing"
);
assert.ok(!source.includes("bnbu.courseAssistant.state.v2"), "v2 running state leaked into dist");
assert.ok(!source.includes("bnbu.courseAssistant.control.v2"), "v2 control state leaked into dist");
assert.ok(source.includes('method: "HEAD"') && source.includes('credentials: "same-origin"'), "same-origin BNBU clock calibration missing");
assert.ok(source.includes("2026-07-20T10:00:00") && source.includes("2026-07-22T18:00:00"), "official selection windows missing");
assert.match(source, /FAST:\s*\[1500,\s*2500\]/, "bounded FAST polling range missing");
assert.ok(!source.includes("dependency-not-occupied"), "old course dependency leaked into dist");
assert.ok(!source.includes("waitlist-count-exceeds-limit"), "waitlist count gate leaked into dist");
assert.ok(!source.includes("category-credit-cap-exceeded"), "credit cap gate leaked into dist");
assert.ok(!source.includes("category-credit-cap-unknown"), "credit availability gate leaked into dist");
assert.ok(!source.includes("element.click()"), "failed DOM click execution path leaked into dist");
assert.ok(!source.includes("武装全自动"), "old armed UI leaked into dist");
assert.ok(source.includes("Yang 抢课脚本"), "branded panel title missing");
assert.ok(source.includes("\\u795D\\u60A8\\u62A2\\u5230\\u5FC3\\u4EEA\\u8BFE\\u7A0B"), "course-selection blessing missing");
for (const action of ["test", "start-immediate", "start-scheduled", "stop", "settings"]) {
  assert.ok(source.includes(action), `missing v3 UI action: ${action}`);
}

console.log(`dist safety check passed (${source.length} bytes)`);
