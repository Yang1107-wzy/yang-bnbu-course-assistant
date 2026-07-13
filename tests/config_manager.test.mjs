import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultConfig, migrateConfig, validateConfig } from "../src/config_manager.js";

test("ships the three requested courses and the editable official windows", () => {
  const config = createDefaultConfig();
  assert.equal(config.version, 3);
  assert.equal(config.clockSyncIntervalMs, 300000);
  assert.equal("pollIntervalSeconds" in config, false);
  assert.deepEqual(config.targets.map(({ id, courseCode, section, category }) => ({ id, courseCode, section, category })), [
    { id: "AI3133:1001", courseCode: "AI3133", section: "1001", category: "ME" },
    { id: "COMP4213:1001", courseCode: "COMP4213", section: "1001", category: "ME" },
    { id: "EBIS3113:1002", courseCode: "EBIS3113", section: "1002", category: "FE" }
  ]);
  assert.deepEqual(config.selectionWindows.map(({ id, enabled }) => ({ id, enabled })), [
    { id: "round-1", enabled: true },
    { id: "round-2", enabled: true },
    { id: "round-3", enabled: true }
  ]);
});

test("replaces only the untouched public DEMO targets during migration", () => {
  const demo = {
    ...createDefaultConfig(),
    targets: [
      { courseCode: "DEMO1001", courseName: "Example Major Elective", section: "1001", category: "ME" },
      { courseCode: "DEMO2001", courseName: "Example Technology Course", section: "1001", category: "ME" },
      { courseCode: "DEMO3001", courseName: "Example Free Elective", section: "1002", category: "FE" }
    ]
  };
  assert.deepEqual(migrateConfig(demo).targets.map((item) => item.courseCode), ["AI3133", "COMP4213", "EBIS3113"]);

  const customized = { ...demo, targets: demo.targets.map((item) => ({ ...item })) };
  customized.targets[0].courseCode = "USER1001";
  customized.targets[0].courseName = "User Course";
  assert.deepEqual(migrateConfig(customized).targets.map((item) => item.courseCode), ["USER1001", "DEMO2001", "DEMO3001"]);
});

test("migrates v2 targets while dropping obsolete runtime limits", () => {
  const migrated = migrateConfig({
    version: 2,
    pollIntervalSeconds: 3,
    categoryCreditCaps: { ME: 6 },
    targets: [{
      id: "TEST100:1001",
      courseCode: "TEST100",
      courseName: "Test Course",
      section: "1001",
      category: "ME",
      credits: 3,
      maxAcceptableQueue: 5
    }]
  });
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.targets, [{
    id: "TEST100:1001",
    courseCode: "TEST100",
    courseName: "Test Course",
    section: "1001",
    category: "ME",
    allowDirectSelect: true,
    allowJoinWaitingList: true
  }]);
  assert.equal("pollIntervalSeconds" in migrated, false);
  assert.equal("categoryCreditCaps" in migrated, false);
  assert.equal(migrated.selectionWindows.length, 3);
});

test("rejects incomplete targets and invalid or overlapping windows", () => {
  const base = createDefaultConfig();
  assert.equal(validateConfig({ ...base, targets: [...base.targets, base.targets[0]] }).valid, false);
  assert.equal(validateConfig({ ...base, targets: [{ ...base.targets[0], courseName: "" }] }).valid, false);
  assert.equal(validateConfig({ ...base, targets: [{ ...base.targets[0], section: "101" }] }).valid, false);
  assert.equal(validateConfig({ ...base, targets: [{ ...base.targets[0], category: "GE" }] }).valid, false);
  assert.equal(validateConfig({
    ...base,
    selectionWindows: [base.selectionWindows[0], { ...base.selectionWindows[1], startText: "2026-07-20T12:00:00" }]
  }).valid, false);
});

test("accepts the default v3 configuration", () => {
  const config = createDefaultConfig();
  assert.deepEqual(validateConfig(config), { valid: true, errors: [] });
  assert.equal(config.actionSpacingMs, 250);
  assert.equal(config.controllerHeartbeatTimeoutMs, 60000);
  assert.equal(config.maxWorkers, 6);
});
