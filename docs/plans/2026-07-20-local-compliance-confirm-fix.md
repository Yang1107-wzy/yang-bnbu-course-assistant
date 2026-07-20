# Local Compliance Confirmation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first-run confirmation button become clickable immediately after the acknowledgement checkbox is selected, without changing automatic course-monitoring behavior.

**Architecture:** Keep the existing compliance dialog, acknowledgement storage and runtime gate. Remove only the transient `scrolledToEnd` UI condition so `accept.disabled` depends solely on the required checkbox.

**Tech Stack:** JavaScript ES modules, Node.js built-in tests, jsdom, ESLint, esbuild, Tampermonkey userscript.

## Global Constraints

- Apply locally only; do not push GitHub or change the `v1.2.2` Release.
- Keep the full Yang-NCEL-1.0 notice and explicit checkbox acknowledgement.
- Keep Worker timing, one-second burst polling, 250 ms action spacing and action whitelist unchanged.
- Keep automatic actions blocked until acknowledgement is stored.

---

### Task 1: Reproduce and fix checkbox-only confirmation

**Files:**
- Modify: `tests/assistant_runtime.test.mjs`
- Modify: `src/ui_panel.js`

**Interfaces:**
- Consumes: `createComplianceDialog(document, options)` and the runtime compliance acknowledgement callback.
- Produces: a confirmation button whose disabled state is `required && !acceptance.checked`.

- [ ] **Step 1: Write the failing regression**

Remove the synthetic scroll setup from the first-run compliance test. After clicking `[data-compliance-acceptance]`, assert:

```js
assert.equal(dialog.querySelector("[data-compliance-accept]").disabled, false);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/assistant_runtime.test.mjs
```

Expected: the first-run test fails because the confirmation button remains disabled without a scroll event.

- [ ] **Step 3: Implement the minimal fix**

Delete `scrolledToEnd` and the `scroll` listener. Use:

```js
const updateAccept = () => {
  if (accept) accept.disabled = required && !acceptance.checked;
};
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/assistant_runtime.test.mjs tests/ui_panel.test.mjs
```

Expected: all compliance and UI tests pass.

- [ ] **Step 5: Commit source and test**

```bash
git add src/ui_panel.js tests/assistant_runtime.test.mjs
git commit -m "fix: enable compliance confirmation after checkbox"
```

### Task 2: Rebuild and verify the local install file

**Files:**
- Modify generated file: `dist/yang-bnbu-course-assistant.user.js`
- Generate ignored local assets: `release/yang-bnbu-course-assistant.user.js`, `release/yang-bnbu-course-assistant-v1.2.2.zip`, `release/SHA256SUMS.txt`

**Interfaces:**
- Consumes: the corrected compliance dialog source.
- Produces: a directly installable local userscript containing the checkbox-only enablement rule.

- [ ] **Step 1: Run complete verification**

```bash
npm run check
npm run package
```

Expected: lint, all tests, build, dist safety and release safety checks pass.

- [ ] **Step 2: Inspect the generated confirmation logic**

```bash
rg -n "scrolledToEnd|acceptance.checked" dist/yang-bnbu-course-assistant.user.js
```

Expected: `acceptance.checked` is present and `scrolledToEnd` is absent.

- [ ] **Step 3: Commit the generated userscript**

```bash
git add dist/yang-bnbu-course-assistant.user.js
git commit -m "build: refresh local compliance fix"
```

- [ ] **Step 4: Merge locally and preserve release assets**

Merge the isolated feature branch into local `main`, rerun `npm test`, regenerate `npm run package` in the main checkout, and do not push any remote.

