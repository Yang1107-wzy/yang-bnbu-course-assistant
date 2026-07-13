const localFallback = (syncedAt, error) => ({
  source: "LOCAL",
  offsetMs: 0,
  rttMs: null,
  uncertaintyMs: null,
  syncedAt,
  error
});

export const estimateClockSync = ({ serverDate, sentAt, receivedAt }) => {
  const serverDateMs = Date.parse(String(serverDate ?? ""));
  if (!Number.isFinite(serverDateMs) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) {
    return localFallback(Number.isFinite(receivedAt) ? receivedAt : Date.now(), "clock-sync-invalid-date");
  }
  const rttMs = receivedAt - sentAt;
  const midpoint = sentAt + rttMs / 2;
  return {
    source: "BNBU_SERVER",
    offsetMs: Math.round(serverDateMs - midpoint),
    rttMs,
    uncertaintyMs: Math.ceil(rttMs / 2 + 500),
    syncedAt: receivedAt,
    error: null
  };
};

export const syncServerClock = async ({
  fetchFn,
  url,
  now = Date.now,
  timeoutMs = 1000,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
}) => {
  const sentAt = now();
  const timeoutToken = Symbol("clock-sync-timeout");
  let timeoutId = null;
  try {
    const fetchPromise = fetchFn(url, {
        method: "HEAD",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "follow"
      });
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => resolve(timeoutToken), timeoutMs);
    });
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    if (response === timeoutToken) return localFallback(now(), "clock-sync-timeout");
    const receivedAt = now();
    const result = estimateClockSync({ serverDate: response?.headers?.get?.("Date"), sentAt, receivedAt });
    return result.source === "BNBU_SERVER" ? result : localFallback(receivedAt, "clock-sync-invalid-date");
  } catch {
    return localFallback(now(), "clock-sync-fetch-failed");
  } finally {
    if (timeoutId !== null) clearTimeoutFn(timeoutId);
  }
};

export const correctedNow = (localNow, sync) => localNow + (Number.isFinite(sync?.offsetMs) ? sync.offsetMs : 0);

export const clockSyncIsFresh = (sync, localNow, maxAgeMs = 300000) => sync?.source === "BNBU_SERVER"
  && Number.isFinite(sync.syncedAt)
  && Number.isFinite(localNow)
  && localNow - sync.syncedAt >= 0
  && localNow - sync.syncedAt <= maxAgeMs;
