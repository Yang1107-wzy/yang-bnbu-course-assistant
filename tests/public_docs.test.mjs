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
  assert.match(readme, /三个专用 Worker/);
  assert.match(readme, /250 ms/);
  assert.match(readme, /已加入轮候/);
  assert.match(readme, /已抢到/);
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

test("public documentation explains the v1.2.1 manual-first hot-page path", async () => {
  const [readme, changelog, release] = await Promise.all([
    read("README.md"),
    read("CHANGELOG.md"),
    read("docs/releases/v1.2.1.md")
  ]);
  for (const source of [readme, changelog, release]) {
    assert.match(source, /前台优先|手动.*详情页|foreground Hot Page|manually opened/i);
    assert.match(source, /不阻塞|异步|without waiting|background/i);
  }
});
