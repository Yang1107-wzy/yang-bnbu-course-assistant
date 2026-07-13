const targetId = (target) => target.id ?? `${target.courseCode}:${target.section}`;
const CATEGORIES = ["ME", "FE"];
const parseHash = (value) => new URL(`https://yang.invalid/?${String(value ?? "").replace(/^#/, "")}`).searchParams;

const groupedTargets = (targets) => CATEGORIES
  .map((category) => ({ category, targets: targets.filter((target) => target.category === category) }))
  .filter((group) => group.targets.length > 0);

export const buildWorkerAssignments = (targets = [], maxWorkers = 6) => {
  const groups = groupedTargets(targets);
  const limit = Math.max(1, Math.min(Number(maxWorkers) || 6, targets.length || 1));
  if (targets.length === 0) return [];

  const counts = Object.fromEntries(groups.map((group) => [group.category, 1]));
  let allocated = groups.length;
  while (allocated < limit) {
    const candidate = groups
      .filter((group) => counts[group.category] < group.targets.length)
      .sort((left, right) => (
        (right.targets.length / (counts[right.category] + 1))
        - (left.targets.length / (counts[left.category] + 1))
      ))[0];
    if (!candidate) break;
    counts[candidate.category] += 1;
    allocated += 1;
  }

  return groups.flatMap((group) => {
    const slots = Array.from({ length: counts[group.category] }, (_, index) => ({
      slotId: `${group.category}-${index + 1}`,
      category: group.category,
      targetIds: []
    }));
    group.targets.forEach((target, index) => slots[index % slots.length].targetIds.push(targetId(target)));
    return slots;
  });
};

export const createWorkerUrl = (baseUrl, slot, openingToken) => {
  const url = new URL(baseUrl);
  const hash = parseHash(url.hash);
  hash.set("yang-worker", slot.slotId);
  hash.set("yang-category", slot.category);
  hash.set("yang-targets", slot.targetIds.join(","));
  hash.set("yang-opening", openingToken);
  url.hash = hash.toString();
  return url.href;
};

export const parseWorkerMarker = (location) => {
  const hash = parseHash(location?.hash);
  const slotId = hash.get("yang-worker");
  const category = hash.get("yang-category");
  const openingToken = hash.get("yang-opening");
  const targetIds = String(hash.get("yang-targets") ?? "").split(",").filter(Boolean);
  if (!slotId || !CATEGORIES.includes(category) || !openingToken || targetIds.length === 0) return null;
  if (!slotId.startsWith(`${category}-`)) return null;
  return { slotId, category, targetIds, openingToken };
};

export const workerSlotIsHealthy = (registry = {}, slotId, now = Date.now(), heartbeatTtlMs = 60000) => {
  const current = registry?.[slotId];
  return Boolean(current?.ownerId
    && Number.isFinite(current.heartbeatAt)
    && now - current.heartbeatAt <= heartbeatTtlMs);
};

export const reserveWorkerOpening = (
  registry = {},
  slot,
  openingToken,
  now = Date.now(),
  openingTtlMs = 30000,
  heartbeatTtlMs = 60000
) => {
  const current = registry?.[slot.slotId];
  const openingHealthy = current?.phase === "OPENING" && current.openingUntil > now;
  if (openingHealthy || workerSlotIsHealthy(registry, slot.slotId, now, heartbeatTtlMs)) {
    return { reserved: false, registry };
  }
  return {
    reserved: true,
    registry: {
      ...registry,
      [slot.slotId]: {
        slotId: slot.slotId,
        category: slot.category,
        targetIds: [...slot.targetIds],
        phase: "OPENING",
        openingToken,
        openingUntil: now + openingTtlMs,
        ownerId: null,
        heartbeatAt: null,
        lastScanAt: current?.lastScanAt ?? null
      }
    }
  };
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
  if (ownedByAnother || tokenMismatch) return { claimed: false, registry };
  return {
    claimed: true,
    registry: {
      ...registry,
      [slot.slotId]: {
        slotId: slot.slotId,
        category: slot.category,
        targetIds: [...slot.targetIds],
        phase: "ONLINE",
        openingToken: null,
        openingUntil: null,
        ownerId: workerId,
        heartbeatAt: now,
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
