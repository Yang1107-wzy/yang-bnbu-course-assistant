import assert from "node:assert/strict";
import test from "node:test";

import {
  clockSyncIsFresh,
  correctedNow,
  estimateClockSync,
  syncServerClock
} from "../src/clock_sync.js";

test("estimates BNBU server offset from the request midpoint", () => {
  const sentAt = Date.UTC(2026, 6, 20, 2, 0, 0, 100);
  const receivedAt = Date.UTC(2026, 6, 20, 2, 0, 0, 300);
  assert.deepEqual(estimateClockSync({
    serverDate: "Mon, 20 Jul 2026 02:00:01 GMT",
    sentAt,
    receivedAt
  }), {
    source: "BNBU_SERVER",
    offsetMs: 800,
    rttMs: 200,
    uncertaintyMs: 600,
    syncedAt: receivedAt,
    error: null
  });
});

test("requests only the current same-origin page with a no-store HEAD", async () => {
  const calls = [];
  const times = [1000, 1200];
  const result = await syncServerClock({
    url: "https://mis.bnbu.edu.cn/mis/student/es/elective.do",
    now: () => times.shift(),
    fetchFn: async (...args) => {
      calls.push(args);
      return { headers: { get: (name) => name.toLowerCase() === "date" ? "Thu, 01 Jan 1970 00:00:02 GMT" : null } };
    }
  });
  assert.deepEqual(calls, [[
    "https://mis.bnbu.edu.cn/mis/student/es/elective.do",
    { method: "HEAD", credentials: "same-origin", cache: "no-store", redirect: "follow" }
  ]]);
  assert.equal(result.source, "BNBU_SERVER");
  assert.equal(result.offsetMs, 900);
});

test("falls back to local time when fetch fails or the Date header is invalid", async () => {
  const failed = await syncServerClock({
    url: "https://mis.bnbu.edu.cn/mis/student/es/elective.do",
    now: () => 5000,
    fetchFn: async () => { throw new Error("offline"); }
  });
  assert.deepEqual(failed, {
    source: "LOCAL",
    offsetMs: 0,
    rttMs: null,
    uncertaintyMs: null,
    syncedAt: 5000,
    error: "clock-sync-fetch-failed"
  });

  const invalid = await syncServerClock({
    url: "https://mis.bnbu.edu.cn/mis/student/es/elective.do",
    now: () => 6000,
    fetchFn: async () => ({ headers: { get: () => "invalid" } })
  });
  assert.equal(invalid.source, "LOCAL");
  assert.equal(invalid.error, "clock-sync-invalid-date");
});

test("falls back to local time when BNBU clock calibration exceeds the hard timeout", async () => {
  const outcome = await Promise.race([
    syncServerClock({
      url: "https://mis.bnbu.edu.cn/mis/student/es/elective.do",
      now: () => 7000,
      timeoutMs: 5,
      fetchFn: () => new Promise(() => {})
    }),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 30))
  ]);
  assert.notEqual(outcome, "still-pending");
  assert.deepEqual(outcome, {
    source: "LOCAL",
    offsetMs: 0,
    rttMs: null,
    uncertaintyMs: null,
    syncedAt: 7000,
    error: "clock-sync-timeout"
  });
});

test("applies offset and expires calibration after five minutes", () => {
  const sync = { source: "BNBU_SERVER", offsetMs: 800, syncedAt: 1000 };
  assert.equal(correctedNow(2000, sync), 2800);
  assert.equal(clockSyncIsFresh(sync, 301000, 300000), true);
  assert.equal(clockSyncIsFresh(sync, 301001, 300000), false);
  assert.equal(clockSyncIsFresh({ source: "LOCAL", offsetMs: 0, syncedAt: 1000 }, 2000, 300000), false);
});
