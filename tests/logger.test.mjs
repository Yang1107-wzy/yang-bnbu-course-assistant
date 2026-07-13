import assert from "node:assert/strict";
import test from "node:test";

import { AuditLogger, sanitizeLogEntry } from "../src/logger.js";

test("removes URL queries and sensitive fields from logs", () => {
  const clean = sanitizeLogEntry({
    timestamp: "2026-07-13T00:00:00.000Z",
    level: "info",
    event: "scan",
    pageUrl: "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=secret",
    courseCode: "DEMO1001",
    cookie: "JSESSIONID=secret",
    token: "abc",
    studentId: "0000000000",
    error: "request failed token=abc"
  });
  assert.equal(clean.pagePath, "/mis/student/es/eleDetail.do");
  assert.equal("cookie" in clean, false);
  assert.equal("token" in clean, false);
  assert.equal("studentId" in clean, false);
  assert.equal(clean.error.includes("abc"), false);
});

test("keeps only the documented audit fields", () => {
  const clean = sanitizeLogEntry({ event: "action", action: "SELECT", courseCode: "DEMO1001", arbitrary: "nope" });
  assert.deepEqual(Object.keys(clean).sort(), ["action", "courseCode", "event"].sort());
});

test("retains only the newest 1000 local audit entries", async () => {
  let stored = [];
  const logger = new AuditLogger({
    get: async () => stored,
    set: async (value) => { stored = value; }
  }, 1000);
  for (let index = 0; index < 1005; index += 1) {
    await logger.append({ event: `event-${index}` });
  }
  assert.equal(stored.length, 1000);
  assert.equal(stored[0].event, "event-5");
  assert.equal(stored[999].event, "event-1004");
});

test("exports deterministic JSON and CSV without sensitive fields", async () => {
  let stored = [];
  const logger = new AuditLogger({
    get: async () => stored,
    set: async (value) => { stored = value; }
  });
  await logger.append({ timestamp: "2026-07-13T00:00:00.000Z", event: "scan", courseCode: "DEMO1001", token: "secret" });
  assert.match(await logger.exportJSON(), /"courseCode": "DEMO1001"/);
  assert.doesNotMatch(await logger.exportJSON(), /secret/);
  assert.match(await logger.exportCSV(), /timestamp,event,courseCode/);
});
