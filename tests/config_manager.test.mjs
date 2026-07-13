import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultConfig, migrateConfig, validateConfig } from "../src/config_manager.js";

test("ships v3 targets and the three editable official windows", () => {
  const config = createDefaultConfig();
  assert.equal(config.version, 3);
  assert.equal(config.clockSyncIntervalMs, 300000);
  assert.equal("pollIntervalSeconds" in config, false);
  assert.deepEqual(config.targets.map(({ id, courseCode, section, category }) => ({ id, courseCode, section, category })), [
    { id: "DEMO1001:1001", courseCode: "DEMO1001", section: "1001", category: "ME" },
    { id: "DEMO2001:1001", courseCode: "DEMO2001", section: "1001", category: "ME" },
    { id: "DEMO3001:1002", courseCode: "DEMO3001", section: "1002", category: "FE" }
  ]);
  assert.deepEqual(config.selectionWindows.map(({ id, enabled }) => ({ id, enabled })), [
    { id: "round-1", enabled: true },
    { id: "round-2", enabled: true },
    { id: "round-3", enabled: true }
  ]);
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
  assert.deepEqual(validateConfig(createDefaultConfig()), { valid: true, errors: [] });
});
