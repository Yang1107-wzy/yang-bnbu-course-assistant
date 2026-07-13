import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  CourseStatus,
  detectSessionExpired,
  findUniqueCourse,
  parseCourseRows,
  parseCreditSummaries
} from "../src/course_parser.js";

const fixture = async (name) => {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return new JSDOM(html, { url: "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=fixture" });
};

test("parses a real selectItem href as one selectable course", async () => {
  const dom = await fixture("selectable.html");
  const rows = parseCourseRows(dom.window.document);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].courseCode, "DEMO1001");
  assert.equal(rows[0].section, "1001");
  assert.equal(rows[0].category, "ME");
  assert.equal(rows[0].status, CourseStatus.SELECTABLE);
  assert.equal(rows[0].selectAction.functionName, "selectItem");
  assert.equal(rows[0].selectAction.argument, "sei-demo1001");
});

test("parses Join Waiting List and its search action", async () => {
  const dom = await fixture("waitlist_available.html");
  const [row] = parseCourseRows(dom.window.document);
  assert.equal(row.status, CourseStatus.WAITLIST_AVAILABLE);
  assert.equal(row.joinWaitingAction.functionName, "joinWaiting");
  assert.equal(row.searchAction.functionName, "viewElective");
});

test("prefers selectItemFromWaiting while permanently ignoring Exit Waiting", async () => {
  const dom = await fixture("waiting.html");
  const [row] = parseCourseRows(dom.window.document);
  assert.equal(row.status, CourseStatus.SELECTABLE);
  assert.equal(row.wasWaiting, true);
  assert.equal(row.selectAction.functionName, "selectItemFromWaiting");
  assert.equal(row.forbiddenActions.length, 1);
  assert.equal(row.forbiddenActions[0].functionName, "exitWaiting");
});

test("recognizes Selected without exposing Replace or Drop as allowed actions", async () => {
  const dom = await fixture("selected.html");
  const [row] = parseCourseRows(dom.window.document);
  assert.equal(row.status, CourseStatus.REGISTERED);
  assert.equal(row.selectAction, null);
  assert.deepEqual(row.forbiddenActions.map((action) => action.functionName), ["replaceItem", "dropItem"]);
});

test("recognizes Clash as a time conflict", async () => {
  const dom = await fixture("clash.html");
  const [row] = parseCourseRows(dom.window.document);
  assert.equal(row.status, CourseStatus.TIME_CONFLICT);
});

test("requires one exact course code and section match", async () => {
  const dom = await fixture("selectable.html");
  const rows = parseCourseRows(dom.window.document);
  assert.equal(findUniqueCourse(rows, { courseCode: "DEMO1001", section: "1001" }).courseCode, "DEMO1001");
  assert.equal(findUniqueCourse(rows, { courseCode: "DEMO1001", section: "1002" }), null);
  assert.equal(findUniqueCourse([...rows, rows[0]], { courseCode: "DEMO1001", section: "1001" }), null);
});

test("requires normalized exact course name in addition to code and section", async () => {
  const dom = await fixture("selectable.html");
  const rows = parseCourseRows(dom.window.document);
  assert.equal(findUniqueCourse(rows, {
    courseCode: "DEMO1001",
    courseName: "Example Major Elective",
    section: "1001"
  }).courseCode, "DEMO1001");
  assert.equal(findUniqueCourse(rows, {
    courseCode: "DEMO1001",
    courseName: "Natural Language Process",
    section: "1001"
  }), null);
});

test("parses category credit summaries from the status page", async () => {
  const dom = await fixture("overview.html");
  const summaries = parseCreditSummaries(dom.window.document);
  assert.deepEqual(summaries.ME, { selected: 3, waiting: 0, assigned: 6 });
  assert.deepEqual(summaries.FE, { selected: 0, waiting: 3, assigned: 6 });
});

test("maps BNBU icon IDs 67/16/68 to assigned/waiting/selected", async () => {
  const dom = await fixture("overview_icons.html");
  const summaries = parseCreditSummaries(dom.window.document);
  assert.deepEqual(summaries.ME, { selected: 0, waiting: 0, assigned: 6 });
  assert.deepEqual(summaries.FE, { selected: 3, waiting: 0, assigned: 6 });
});

test("detects an expired login session", async () => {
  const dom = await fixture("session_expired.html");
  assert.equal(detectSessionExpired(dom.window.document), true);
});
