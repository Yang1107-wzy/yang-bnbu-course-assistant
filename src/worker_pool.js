const targetId = (target) => target.id ?? `${target.courseCode}:${target.section}`;
const CATEGORIES = ["ME", "FE"];
export const WORKER_GENERATION = 2;
const HOT_PREFIX = "HOT-";
const OPEN_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];

const parseHash = (value) => new URL(`https://yang.invalid/?${String(value ?? "").replace(/^#/, "")}`).searchParams;
const healthyHeartbeat = (entry, now, heartbeatTtlMs) => Boolean(entry?.ownerId
  && entry.phase !== "FAILED"
  && Number.isFinite(entry.heartbeatAt)
  && now - entry.heartbeatAt <= heartbeatTtlMs);

export const buildWorkerAssignments = (targets = [], _maxWorkers = 2, generation = WORKER_GENERATION) => CATEGORIES
  .map((category) => {
    const matching = targets.filter((target) => target.category === category);
    if (matching.length === 0) return null;
    return {
      slotId: `${category}-1`,
      category,
      generation,
      targetIds: matching.map(targetId)
    };
  })
  .filter(Boolean);

export const createWorkerUrl = (baseUrl, slot, openingToken) => {
  const url = new URL(baseUrl);
  const hash = parseHash(url.hash);
  hash.set("yang-worker", slot.slotId);
  hash.set("yang-category", slot.category);
  hash.set("yang-generation", String(slot.generation ?? WORKER_GENERATION));
  hash.set("yang-opening", openingToken);
  hash.delete("yang-targets");
  url.hash = hash.toString();
  return url.href;
};

export const parseWorkerMarker = (location) => {
  const hash = parseHash(location?.hash);
  const slotId = hash.get("yang-worker");
  const category = hash.get("yang-category");
  const openingToken = hash.get("yang-opening");
  const generation = Number(hash.get("yang-generation"));
  if (!slotId || !CATEGORIES.includes(category) || !openingToken || !Number.isInteger(generation)) return null;
  if (slotId !== `${category}-1`) return null;
  return { slotId, category, generation, openingToken };
};

export const workerSlotIsHealthy = (registry = {}, slotId, now = Date.now(), heartbeatTtlMs = 60000) => (
  healthyHeartbeat(registry?.[slotId], now, heartbeatTtlMs)
);

export const categoryCoverageIsHealthy = (registry = {}, category, now = Date.now(), heartbeatTtlMs = 60000) => (
  Object.values(registry).some((entry) => entry?.category === category && healthyHeartbeat(entry, now, heartbeatTtlMs))
);

export const heartbeatHotPage = (
  registry = {},
  category,
  workerId,
  now = Date.now(),
  lastScanAt
) => {
  if (!CATEGORIES.includes(category) || !workerId) return { updated: false, registry };
  const slotId = `${HOT_PREFIX}${category}:${workerId}`;
  return {
    updated: true,
    registry: {
      ...registry,
      [slotId]: {
        slotId,
        category,
        role: "HOT",
        phase: "ONLINE",
        ownerId: workerId,
        heartbeatAt: now,
        lastScanAt: lastScanAt ?? registry?.[slotId]?.lastScanAt ?? null
      }
    }
  };
};

const retryDelay = (retryCount) => OPEN_RETRY_DELAYS_MS[Math.min(Math.max(0, retryCount - 1), OPEN_RETRY_DELAYS_MS.length - 1)];

export const reserveWorkerOpening = (
  registry = {},
  slot,
  openingToken,
  now = Date.now(),
  openingTtlMs = 15000,
  heartbeatTtlMs = 60000
) => {
  const current = registry?.[slot.slotId];
  const openingHealthy = current?.phase === "OPENING" && current.openingUntil > now;
  if (openingHealthy || categoryCoverageIsHealthy(registry, slot.category, now, heartbeatTtlMs)) {
    return { reserved: false, registry };
  }

  if (current?.phase === "OPENING" && current.openingUntil <= now) {
    const retryCount = (current.retryCount ?? 0) + 1;
    const retryAt = current.openingUntil + retryDelay(retryCount);
    const failed = {
      ...current,
      phase: "FAILED",
      openingToken: null,
      openingUntil: null,
      retryCount,
      retryAt,
      lastError: "worker-open-timeout"
    };
    const nextRegistry = { ...registry, [slot.slotId]: failed };
    if (now < retryAt) return { reserved: false, registry: nextRegistry };
    return reserveWorkerOpening(nextRegistry, slot, openingToken, now, openingTtlMs, heartbeatTtlMs);
  }

  if (current?.phase === "FAILED" && Number.isFinite(current.retryAt) && current.retryAt > now) {
    return { reserved: false, registry };
  }

  return {
    reserved: true,
    registry: {
      ...registry,
      [slot.slotId]: {
        slotId: slot.slotId,
        category: slot.category,
        generation: slot.generation ?? WORKER_GENERATION,
        targetIds: [...slot.targetIds],
        role: "WORKER",
        phase: "OPENING",
        openingToken,
        openingUntil: now + openingTtlMs,
        ownerId: null,
        heartbeatAt: null,
        retryCount: current?.retryCount ?? 0,
        retryAt: null,
        lastError: null,
        lastScanAt: current?.lastScanAt ?? null
      }
    }
  };
};

export const reserveWorkerOpenings = (
  registry = {},
  slots = [],
  tokenFactory,
  now = Date.now(),
  openingTtlMs = 15000,
  heartbeatTtlMs = 60000
) => {
  let nextRegistry = registry;
  const reservations = [];
  for (const slot of slots) {
    const openingToken = tokenFactory(slot);
    const result = reserveWorkerOpening(nextRegistry, slot, openingToken, now, openingTtlMs, heartbeatTtlMs);
    nextRegistry = result.registry;
    if (result.reserved) reservations.push({ slot, openingToken });
  }
  return { registry: nextRegistry, reservations, changed: nextRegistry !== registry };
};

export const claimWorkerSlot = (
  registry = {},
  slot,
  workerId,
  openingToken,
  now = Date.now(),
  heartbeatTtlMs = 60000
) => {
  const current = registry?.[slot.slotId];
  const ownedByAnother = workerSlotIsHealthy(registry, slot.slotId, now, heartbeatTtlMs)
    && current.ownerId !== workerId;
  const tokenMismatch = current?.openingToken && current.openingToken !== openingToken && current.ownerId !== workerId;
  const expectedGeneration = Number(slot.generation ?? WORKER_GENERATION);
  const generationMismatch = Number(current?.generation ?? expectedGeneration) !== expectedGeneration;
  if (ownedByAnother || tokenMismatch || generationMismatch) {
    return { claimed: false, registry, reason: ownedByAnother ? "worker-owned" : generationMismatch ? "worker-generation-mismatch" : "opening-token-mismatch" };
  }
  return {
    claimed: true,
    registry: {
      ...registry,
      [slot.slotId]: {
        slotId: slot.slotId,
        category: slot.category,
        generation: slot.generation ?? WORKER_GENERATION,
        targetIds: [...slot.targetIds],
        role: "WORKER",
        phase: "ONLINE",
        openingToken: null,
        openingUntil: null,
        ownerId: workerId,
        heartbeatAt: now,
        retryCount: 0,
        retryAt: null,
        lastError: null,
        lastScanAt: current?.lastScanAt ?? null
      }
    }
  };
};

export const heartbeatWorkerSlot = (registry = {}, slotId, workerId, now = Date.now(), lastScanAt) => {
  const current = registry?.[slotId];
  if (!current || current.ownerId !== workerId) return { updated: false, registry };
  return {
    updated: true,
    registry: {
      ...registry,
      [slotId]: {
        ...current,
        phase: "ONLINE",
        heartbeatAt: now,
        lastScanAt: lastScanAt ?? current.lastScanAt ?? null
      }
    }
  };
};

export const markWorkerPhase = (registry = {}, slotId, workerId, phase, now = Date.now(), lastError = null) => {
  const current = registry?.[slotId];
  if (!current || current.ownerId !== workerId || !["ONLINE", "SUBMITTING", "FAILED"].includes(phase)) {
    return { updated: false, registry };
  }
  return {
    updated: true,
    registry: {
      ...registry,
      [slotId]: {
        ...current,
        phase,
        heartbeatAt: now,
        lastError
      }
    }
  };
};
