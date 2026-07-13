export const createCoordinatorState = (now = Date.now()) => ({
  version: 1,
  updatedAt: now,
  monitoring: false,
  liveAutomation: false,
  armedUntil: 0,
  actionLock: null,
  heartbeats: {},
  courseStatuses: {},
  courseReasons: {},
  pendingActions: {},
  creditSummaries: {},
  guardSnapshot: null,
  lastActionAt: null,
  panicReason: null
});

export const armCoordinator = (state, now, durationMinutes) => ({
  ...state,
  updatedAt: now,
  armedUntil: now + durationMinutes * 60000,
  panicReason: null
});

export const isArmed = (state, now = Date.now()) => !state.panicReason && state.armedUntil > now;

export const acquireActionLock = (state, ownerId, now = Date.now(), ttlMs = 15000) => {
  const current = state.actionLock;
  if (current && current.expiresAt > now && current.ownerId !== ownerId) {
    return { acquired: false, state, lock: current };
  }
  const lock = { ownerId, acquiredAt: now, expiresAt: now + ttlMs };
  return { acquired: true, state: { ...state, updatedAt: now, actionLock: lock }, lock };
};

export const createReloadLease = (category, path, now = Date.now(), ttlMs = 10000) => ({
  category,
  path,
  createdAt: now,
  expiresAt: now + ttlMs,
  token: `${category}:${now}`
});

export const consumeReloadLease = (lease, currentPath, now = Date.now()) => ({
  valid: Boolean(lease && lease.path === currentPath && lease.expiresAt >= now),
  lease: null
});

export const recordHeartbeat = (state, role, tabId, now = Date.now()) => ({
  ...state,
  updatedAt: now,
  heartbeats: {
    ...state.heartbeats,
    [role]: { tabId, at: now }
  }
});

export const shouldPanicForMissingController = (state, now = Date.now(), timeoutMs = 45000) => {
  const heartbeat = state.heartbeats.controller;
  return !heartbeat || now - heartbeat.at > timeoutMs;
};

const defaultSettle = () => new Promise((resolve) => window.setTimeout(resolve, 50));

export const attemptPersistentActionLock = async ({ storage, ownerId, nonce, now = Date.now(), ttlMs = 15000, settle = defaultSettle }) => {
  const current = await storage.get();
  const attempt = acquireActionLock(current, ownerId, now, ttlMs);
  if (!attempt.acquired) return attempt;
  const state = {
    ...attempt.state,
    actionLock: { ...attempt.lock, nonce }
  };
  await storage.set(state);
  await settle();
  const verified = await storage.get();
  const acquired = verified.actionLock?.ownerId === ownerId
    && verified.actionLock?.nonce === nonce
    && verified.actionLock?.expiresAt > now;
  return { acquired, state: verified, lock: verified.actionLock };
};
