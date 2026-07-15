# Target Course Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the untouched public AI3133 default target with COMP3073 while preserving COMP4213, EBIS3113, custom user configurations, and every non-target runtime setting.

**Architecture:** Keep the existing v3 configuration schema. Add the old three-course public target set as an exact migration source, change only `DEFAULT_TARGETS`, and route both the original DEMO set and the old public set to the new defaults. Update current documentation, diagnostics, preview data, release checks, and tests without rewriting historical release notes.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, jsdom, ESLint, esbuild, Tampermonkey userscript.

## Global Constraints

- The current release remains version `1.2.2`; this change is folded into the unpushed local release.
- New defaults are exactly COMP3073 / Introduction to Robotics / 1002 / ME, COMP4213 / Wireless Communication and Mobile Computing / 1001 / ME, and EBIS3113 / Business Forecasting and Machine Learning / 1002 / FE.
- Only an exact untouched old-default target list is migrated; any customized target list is preserved.
- Do not change selection windows, panel layout, compliance acknowledgement, Worker timing, action queue, or confirmation bridge.
- Never enable `Drop`, `Replace`, or `Exit Waiting`.
- Do not claim or implement real timetable, credit, or registration changes.

---

### Task 1: Lock the new defaults and migration behavior with failing tests

**Files:**
- Modify: `tests/config_manager.test.mjs`
- Modify: `tests/release_branding.test.mjs`

**Interfaces:**
- Consumes: `createDefaultConfig()` and `migrateConfig(input)` from `src/config_manager.js`.
- Produces: executable expectations for the exact target set and the conservative old-default migration.

- [ ] **Step 1: Change the default-target expectation**

Use this exact target expectation in both configuration and branding tests:

```js
[
  { id: "COMP3073:1002", courseCode: "COMP3073", section: "1002", category: "ME" },
  { id: "COMP4213:1001", courseCode: "COMP4213", section: "1001", category: "ME" },
  { id: "EBIS3113:1002", courseCode: "EBIS3113", section: "1002", category: "FE" }
]
```

- [ ] **Step 2: Add an exact old-public-default migration test**

Construct the old AI3133/COMP4213/EBIS3113 list and assert:

```js
assert.deepEqual(
  migrateConfig(oldPublicConfig).targets.map(({ courseCode, courseName, section, category }) => ({ courseCode, courseName, section, category })),
  [
    { courseCode: "COMP3073", courseName: "Introduction to Robotics", section: "1002", category: "ME" },
    { courseCode: "COMP4213", courseName: "Wireless Communication and Mobile Computing", section: "1001", category: "ME" },
    { courseCode: "EBIS3113", courseName: "Business Forecasting and Machine Learning", section: "1002", category: "FE" }
  ]
);
```

Also change one old course name in a copied configuration and assert all three customized targets remain unchanged.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test tests/config_manager.test.mjs tests/release_branding.test.mjs
```

Expected: failures mention `AI3133:1001` where the tests require `COMP3073:1002`.

### Task 2: Implement the minimal conservative migration

**Files:**
- Modify: `src/config_manager.js`
- Test: `tests/config_manager.test.mjs`
- Test: `tests/release_branding.test.mjs`

**Interfaces:**
- Consumes: existing `target(...)`, `sameTargets(left, right)`, and `cleanConfig(input)` helpers.
- Produces: `createDefaultConfig()` with new defaults and `migrateConfig(input)` that recognizes both legacy default sets.

- [ ] **Step 1: Preserve the old public set as a migration source**

Define:

```js
const LEGACY_PUBLIC_TARGETS = [
  target("AI3133", "Natural Language Processing", "1001", "ME"),
  target("COMP4213", "Wireless Communication and Mobile Computing", "1001", "ME"),
  target("EBIS3113", "Business Forecasting and Machine Learning", "1002", "FE")
];
```

- [ ] **Step 2: Replace only the current defaults**

Set:

```js
const DEFAULT_TARGETS = [
  target("COMP3073", "Introduction to Robotics", "1002", "ME"),
  target("COMP4213", "Wireless Communication and Mobile Computing", "1001", "ME"),
  target("EBIS3113", "Business Forecasting and Machine Learning", "1002", "FE")
];
```

- [ ] **Step 3: Route exact legacy sets to the new defaults**

Implement migration with an explicit boolean:

```js
export const migrateConfig = (input) => {
  const migrateDefaults = sameTargets(input?.targets, LEGACY_DEMO_TARGETS)
    || sameTargets(input?.targets, LEGACY_PUBLIC_TARGETS);
  return cleanConfig(migrateDefaults ? { ...input, targets: DEFAULT_TARGETS } : input);
};
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/config_manager.test.mjs tests/release_branding.test.mjs
```

Expected: both files pass.

- [ ] **Step 5: Commit the behavioral change**

```bash
git add src/config_manager.js tests/config_manager.test.mjs tests/release_branding.test.mjs
git commit -m "feat: replace NLP default target with robotics"
```

### Task 3: Synchronize current public surfaces and release safety checks

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/MANUAL_TEST_CHECKLIST.md`
- Modify: `docs/releases/v1.2.2.md`
- Modify: `tools/dom_diagnostic.user.js`
- Modify: `tools/ui_preview.html`
- Modify: `tools/check-dist.mjs`
- Modify: `tests/public_docs.test.mjs`
- Modify: `tests/ui_panel.test.mjs` only where a test represents the current public default set
- Modify: `tests/worker_pool.test.mjs` only where a test represents the current public default set

**Interfaces:**
- Consumes: new defaults from `createDefaultConfig()`.
- Produces: consistent current documentation, diagnostics, preview, and dist validation.

- [ ] **Step 1: Update user-facing current-course lists**

Replace current-default references with:

```text
COMP3073 (1002)、COMP4213 (1001)、EBIS3113 (1002)
```

Do not edit historical `v1.1.0`, `v1.2.0`, or `v1.2.1` release notes.

- [ ] **Step 2: Update diagnostic and preview fixtures**

Use `COMP3073 / Introduction to Robotics / 1002 / ME` wherever the current preview or diagnostic target previously used AI3133. Keep COMP4213 and EBIS3113 unchanged.

- [ ] **Step 3: Strengthen the dist contract**

Require all three current targets and reject the retired default:

```js
for (const target of ["COMP3073", "COMP4213", "EBIS3113"]) {
  assert.ok(source.includes(target), `configured default target missing: ${target}`);
}
assert.ok(!source.includes('target("AI3133", "Natural Language Processing"'), "retired AI3133 default leaked into dist");
```

The built bundle may still contain the legacy migration data, so the rejection must target the current default expression rather than all occurrences of `AI3133`.

- [ ] **Step 4: Run affected tests**

Run:

```bash
node --test tests/config_manager.test.mjs tests/release_branding.test.mjs tests/public_docs.test.mjs tests/ui_panel.test.mjs tests/worker_pool.test.mjs
```

Expected: all affected tests pass.

- [ ] **Step 5: Commit synchronized surfaces**

```bash
git add README.md docs tools tests
git commit -m "docs: synchronize robotics target defaults"
```

### Task 4: Build and verify the v1.2.2 release candidate

**Files:**
- Modify generated file: `dist/yang-bnbu-course-assistant.user.js`
- Verify generated assets under: `release/`

**Interfaces:**
- Consumes: all prior source and documentation changes.
- Produces: a tested v1.2.2 userscript, ZIP, and SHA-256 manifest.

- [ ] **Step 1: Run the complete verification pipeline**

```bash
npm run check
npm run package
```

Expected: ESLint passes, every test passes, dist safety check passes, and release safety check passes.

- [ ] **Step 2: Inspect archive and checksums**

```bash
unzip -l release/yang-bnbu-course-assistant-v1.2.2.zip
shasum -a 256 release/yang-bnbu-course-assistant.user.js release/yang-bnbu-course-assistant-v1.2.2.zip
cat release/SHA256SUMS.txt
```

Expected: ZIP contains the userscript, README, LICENSE, and CHANGELOG; computed hashes exactly match `SHA256SUMS.txt`.

- [ ] **Step 3: Verify the exact target contract in the generated script**

```bash
rg -n "COMP3073|Introduction to Robotics|COMP4213|EBIS3113|AI3133" dist/yang-bnbu-course-assistant.user.js
```

Expected: COMP3073 appears as a current default; AI3133 appears only in legacy migration compatibility data.

- [ ] **Step 4: Commit the generated release candidate**

```bash
git add dist/yang-bnbu-course-assistant.user.js
git commit -m "build: refresh v1.2.2 userscript"
```

- [ ] **Step 5: Report remaining external-write gate**

Report the local commits, verification results, asset paths, and hashes. Do not push GitHub or create a release until the user separately confirms the exact repository, branch, tag, and assets.

