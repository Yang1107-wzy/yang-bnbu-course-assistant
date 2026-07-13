import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { JSDOM } from "jsdom";

import { createDefaultConfig } from "../src/config_manager.js";
import { createPanel } from "../src/ui_panel.js";

const repoFile = (path) => new URL(`../${path}`, import.meta.url);

test("ships only non-matching DEMO targets in the public default config", () => {
  const config = createDefaultConfig();
  assert.deepEqual(config.targets.map((target) => target.courseCode), ["DEMO1001", "DEMO2001", "DEMO3001"]);
  assert.ok(config.targets.every((target) => target.courseName.startsWith("Example ")));
});

test("renders the Yang brand and course-selection blessing", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const panel = createPanel(dom.window.document, { config: createDefaultConfig(), callbacks: {} });
  assert.match(panel.root.textContent, /Yang 抢课脚本/);
  assert.match(panel.root.textContent, /祝您抢到心仪课程/);
  assert.doesNotMatch(panel.root.textContent, /MIS 自动选课助手 v3/);
});

test("build contract publishes the branded v1 userscript filename and metadata", async () => {
  const source = await readFile(repoFile("build.mjs"), "utf8");
  assert.match(source, /@name\s+Yang 抢课脚本/);
  assert.match(source, /@version\s+1\.0\.0/);
  assert.match(source, /@author\s+Yang1107-wzy/);
  assert.match(source, /@license\s+MIT/);
  assert.match(source, /dist\/yang-bnbu-course-assistant\.user\.js/);
  assert.doesNotMatch(source, /dist\/course_waitlist_assistant\.user\.js/);
});
