import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import { executeGuardedDomAction, executePageAction } from "../src/action_executor.js";
import { parseCourseRows } from "../src/course_parser.js";

const parsedRow = async () => {
  const html = await readFile(new URL("./fixtures/selectable.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=x" });
  return { dom, row: parseCourseRows(dom.window.document)[0] };
};

test("temporarily confirms one exact target action and restores native confirm", async () => {
  const { dom, row } = await parsedRow();
  const nativeConfirm = () => false;
  dom.window.confirm = nativeConfirm;
  const result = executeGuardedDomAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window,
    click: () => assert.equal(dom.window.confirm("Select Example Major Elective (1001), are you sure?"), true)
  });
  assert.equal(result.ok, true);
  assert.equal(dom.window.confirm, nativeConfirm);
});

test("rejects mismatched confirmation text and restores confirm", async () => {
  const { dom, row } = await parsedRow();
  const nativeConfirm = () => false;
  dom.window.confirm = nativeConfirm;
  const result = executeGuardedDomAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window,
    click: () => assert.equal(dom.window.confirm("Select Another Course (1001), are you sure?"), false)
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "confirmation-text-mismatch");
  assert.equal(dom.window.confirm, nativeConfirm);
});

test("never executes a forbidden or detached action element", async () => {
  const { dom, row } = await parsedRow();
  const forbidden = dom.window.document.createElement("a");
  forbidden.href = "javascript:dropItem('x')";
  row.selectAction = { element: forbidden, functionName: "dropItem", argument: "x" };
  const result = executeGuardedDomAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window,
    click: () => assert.fail("must not click")
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /forbidden|detached/);
});

test("restores confirm when the click throws", async () => {
  const { dom, row } = await parsedRow();
  const nativeConfirm = () => false;
  dom.window.confirm = nativeConfirm;
  assert.throws(() => executeGuardedDomAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window,
    click: () => { throw new Error("click failed"); }
  }), /click failed/);
  assert.equal(dom.window.confirm, nativeConfirm);
});

test("rejects an unexpected second confirmation dialog", async () => {
  const { dom, row } = await parsedRow();
  const target = { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" };
  const nativeConfirm = dom.window.confirm;
  const result = executeGuardedDomAction({
    row,
    target,
    actionType: "SELECT",
    pageWindow: dom.window,
    click: () => {
      dom.window.confirm("Select Example Major Elective (1001)?");
      dom.window.confirm("Select Example Major Elective (1001)?");
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unexpected-confirmation-count");
  assert.equal(dom.window.confirm, nativeConfirm);
});

test("invokes the MIS page function directly and observes its confirmation", async () => {
  const { dom, row } = await parsedRow();
  const target = { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" };
  let argument = null;
  dom.window.selectItem = (value) => {
    argument = value;
    return dom.window.confirm("Select Example Major Elective (1001), are you sure?");
  };
  const result = executePageAction({ row, target, actionType: "SELECT", pageWindow: dom.window });
  assert.equal(argument, "sei-demo1001");
  assert.deepEqual(result, {
    ok: true,
    reason: "confirmation-accepted",
    functionName: "selectItem",
    confirmationObserved: true
  });
});

test("refuses a parsed action when its MIS page function is unavailable", async () => {
  const { dom, row } = await parsedRow();
  const result = executePageAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "page-function-unavailable");
  assert.equal(result.confirmationObserved, false);
});

test("uses the same page-function bridge for selectItemFromWaiting", async () => {
  const html = await readFile(new URL("./fixtures/waiting.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me" });
  const row = parseCourseRows(dom.window.document)[0];
  let calledWith = null;
  dom.window.selectItemFromWaiting = (value) => {
    calledWith = value;
    return dom.window.confirm("Select Example Major Elective (1001), are you sure?");
  };
  const result = executePageAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window
  });
  assert.equal(calledWith, "sei-ai");
  assert.equal(result.ok, true);
  assert.equal(result.functionName, "selectItemFromWaiting");
});

test("uses the same page-function bridge for joinWaiting", async () => {
  const html = await readFile(new URL("./fixtures/waitlist_available.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=fe" });
  const row = parseCourseRows(dom.window.document)[0];
  let calledWith = null;
  dom.window.joinWaiting = (value) => {
    calledWith = value;
    return dom.window.confirm("Join Waiting List of Example Free Elective (1002)?");
  };
  const result = executePageAction({
    row,
    target: { courseCode: "DEMO3001", courseName: "Example Free Elective", section: "1002" },
    actionType: "JOIN_WAITLIST",
    pageWindow: dom.window
  });
  assert.equal(calledWith, "sei-demo3001");
  assert.equal(result.ok, true);
  assert.equal(result.functionName, "joinWaiting");
});

test("revalidates the exact normalized course name before calling MIS", async () => {
  const { dom, row } = await parsedRow();
  let called = false;
  dom.window.selectItem = () => { called = true; };
  const result = executePageAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Another Course", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "target-row-mismatch");
  assert.equal(called, false);
});

test("restores confirm and reports a thrown page function", async () => {
  const { dom, row } = await parsedRow();
  const nativeConfirm = dom.window.confirm;
  dom.window.selectItem = () => { throw new Error("MIS failed"); };
  const result = executePageAction({
    row,
    target: { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001" },
    actionType: "SELECT",
    pageWindow: dom.window
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "page-function-threw");
  assert.equal(dom.window.confirm, nativeConfirm);
});
