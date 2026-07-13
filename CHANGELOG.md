# Changelog

## 1.2.1 - 2026-07-13

- Promoted manually opened ME/FE detail pages to foreground Hot Pages that scan every configured target in the visible category.
- Made immediate start publish RUNNING and scan the current page before BNBU clock calibration or Worker prewarming.
- Added a one-second hard timeout for same-origin server clock calibration with explicit local-clock fallback.
- Made Test return the current-page result without waiting for background tabs and reduced Worker reservations to one batch storage update.
- Added foreground queue priority while retaining shared deduplication, pending-action verification and the three dedicated fallback Workers.

## 1.2.0 - 2026-07-13

- Added a bounded target-aware Worker pool: the three default courses receive dedicated workers and larger configurations use at most six tabs.
- Added 30-second opening leases, 60-second heartbeats and stable URL/session markers to prevent duplicate workers.
- Added one-second burst polling around opening windows, three-second normal polling and immediate refresh freeze once an action appears.
- Reduced global FIFO action spacing from 1.2 seconds to 250 milliseconds while retaining guarded page-function execution.
- Added controller target cards and read-only Worker mini bars for opening, scanning, waiting, registered, failure and offline states.
- Made unmarked or duplicate detail tabs observer-only and added a one-time safe STOPPED migration from v1.1.0.

## 1.1.0 - 2026-07-13

- Added an isolated panel layout controller with title-bar dragging and bottom-right free resizing.
- Added a compact draggable `Yang` collapsed state, viewport recovery and persistent cross-page layout.
- Added Tampermonkey menu commands to show or reset the panel.
- Prefilled AI3133 (1001), COMP4213 (1001) and EBIS3113 (1002), while migrating only untouched legacy DEMO defaults.
- Kept automatic Select, Select from Waiting and Join Waiting List behavior unchanged.

## 1.0.0 - 2026-07-13

- Published the project as **Yang 抢课脚本** under the MIT License.
- Added public-safe DEMO targets, sanitized fixtures and a branded standalone userscript.
- Added professional installation, usage, security and contribution documentation.
- Added reproducible Release packaging with SHA-256 checksums.
- Added GitHub Actions verification for Node.js 20, tests, build, dist safety and packaging.

## 0.3.0 - 2026-07-13

- Added separate immediate and scheduled start paths.
- Added the three official July 20–22, 2026 Beijing-time selection windows with an editable window editor.
- Added same-origin BNBU HTTP Date calibration with RTT/uncertainty display and local-clock fallback.
- Added adaptive randomized polling: no far-future reload, 15–25s preheat, 4–7s acceleration and bounded 1.5–2.5s active polling.
- Added sleep/wake schedule reconciliation, cross-round pause/resume and automatic stop when all targets are registered.
- Migrated course configuration from v2 while starting with clean v3 runtime/control state.

## 0.2.3 - 2026-07-13

- Removed all local credit and waiting-queue-size gates from `Join Waiting List`.
- A uniquely matched target with an approved `joinWaiting` entry now submits immediately while running.
- Removed automatic waiting-list detail inspection and obsolete credit/queue-limit configuration fields.

## 0.2.2 - 2026-07-13

- Corrected the live BNBU credit icons: `67.png` is Assigned, `16.png` is Waiting and `68.png` is Selected.
- Added an end-to-end automatic `joinWaiting` regression using visible queue count and category credits.
- Clarified STOPPED and waiting-list UI messages so Start is visibly required for automatic actions.

## 0.2.1 - 2026-07-13

- Migrated every MIS userscript match, test URL, diagnostic tool and document to the current BNBU hostname.

## 0.2.0 - 2026-07-13

- Replaced the failed DOM `click()` path with direct calls to approved MIS page functions through `unsafeWindow`.
- Simplified the UI to Test, Start, Stop, course settings and a 3–60 second polling input.
- Removed Armed/Pause controls and all course dependencies; all targets are independently scanned and queued.
- Added FIFO cross-tab action records, 1.2 second spacing, function-signature revalidation and explicit READY diagnostics.
- Added clean `.v2` GM state/config keys and corrected icon-based ME/FE credit mapping.
- Added an authoritative cross-tab Start/Stop control and a 15-second post-submit verification window.
- Added editable exact-name targets and regression tests for Select, Select-from-Waiting, Join Waiting List and failures.

## 0.1.0 - 2026-07-13

- Initial Chrome/Tampermonkey single-file implementation.
- Added exact target parsing, dependency-aware decisions and ME/FE coordination.
- Added guarded Select/Select-from-Waiting/Join-Waiting execution.
- Added global rate limits, cooldown, heartbeat, reload and panic protections.
- Added draggable visual panel, config/log export, read-only diagnostic script and fixtures.
- Added ESLint, Node tests, esbuild bundle and dist safety audit.
