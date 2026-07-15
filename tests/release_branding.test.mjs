import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { JSDOM } from "jsdom";

import { createDefaultConfig } from "../src/config_manager.js";
import { createPanel } from "../src/ui_panel.js";

const repoFile = (path) => new URL(`../${path}`, import.meta.url);

test("ships the three requested courses in the public default config", () => {
  const config = createDefaultConfig();
  assert.deepEqual(config.targets.map((target) => `${target.courseCode}:${target.section}:${target.category}`), [
    "COMP3073:1002:ME",
    "COMP4213:1001:ME",
    "EBIS3113:1002:FE"
  ]);
});

test("renders the Yang brand and course-selection blessing", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const panel = createPanel(dom.window.document, { config: createDefaultConfig(), callbacks: {} });
  assert.match(panel.root.textContent, /Yang 抢课脚本/);
  assert.match(panel.root.textContent, /祝您抢到心仪课程/);
  assert.doesNotMatch(panel.root.textContent, /MIS 自动选课助手 v3/);
});

test("build contract publishes the branded v1.2.2 non-commercial userscript metadata", async () => {
  const source = await readFile(repoFile("build.mjs"), "utf8");
  assert.match(source, /@name\s+Yang 抢课脚本/);
  assert.match(source, /@version\s+1\.2\.2/);
  assert.match(source, /@author\s+Yang1107-wzy/);
  assert.match(source, /@license\s+Yang-NCEL-1\.0/);
  assert.match(source, /仅供学习交流/);
  assert.doesNotMatch(source, /@license\s+MIT/);
  assert.match(source, /dist\/yang-bnbu-course-assistant\.user\.js/);
  assert.doesNotMatch(source, /dist\/course_waitlist_assistant\.user\.js/);
});
