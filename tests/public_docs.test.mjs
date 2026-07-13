import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("README documents the public install and both start modes", async () => {
  const readme = await read("README.md");
  assert.match(readme, /^# Yang 抢课脚本/m);
  assert.match(readme, /dist\/yang-bnbu-course-assistant\.user\.js/);
  assert.match(readme, /立即启动/);
  assert.match(readme, /预约启动/);
  assert.match(readme, /首次使用.*设置/s);
  assert.match(readme, /未完成真实选课提交验收/);
  assert.doesNotMatch(readme, /DEMO1001/);
});

test("public governance files define MIT, security and contribution policies", async () => {
  const [license, security, contributing, issueTemplate] = await Promise.all([
    read("LICENSE"),
    read("SECURITY.md"),
    read("CONTRIBUTING.md"),
    read(".github/ISSUE_TEMPLATE/bug-report.yml")
  ]);
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Yang1107-wzy/);
  assert.match(security, /Security Advisories/);
  assert.match(contributing, /npm run check/);
  assert.match(issueTemplate, /Tampermonkey/);
});

test("GitHub Actions validates tests, release package and committed dist", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  assert.match(workflow, /node-version: 20/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run package/);
  assert.match(workflow, /git diff --exit-code -- dist\/yang-bnbu-course-assistant\.user\.js/);
});
