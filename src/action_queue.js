const entryKey = (target, action) => `${target.id ?? `${target.courseCode}:${target.section}`}:${action}`;

export const enqueueCandidates = (queue = [], candidates = [], workerId, observedAt = Date.now()) => {
  const known = new Set(queue.map((item) => item.key));
  const next = [...queue];
  for (const candidate of candidates) {
    const key = entryKey(candidate.target, candidate.decision.action);
    if (known.has(key)) continue;
    const action = candidate.decision.action === "SELECT"
      ? candidate.row?.selectAction
      : candidate.row?.joinWaitingAction;
    known.add(key);
    next.push({
      key,
      workerId,
      targetId: candidate.target.id ?? `${candidate.target.courseCode}:${candidate.target.section}`,
      courseCode: candidate.target.courseCode,
      section: candidate.target.section,
      actionType: candidate.decision.action,
      functionName: action?.functionName ?? null,
      argument: action?.argument ?? null,
      observedAt
    });
  }
  return next;
};

export const actionSignatureMatches = (queued, evaluation) => {
  const action = evaluation?.decision?.action === "SELECT"
    ? evaluation.row?.selectAction
    : evaluation?.row?.joinWaitingAction;
  return Boolean(action
    && queued.actionType === evaluation.decision.action
    && queued.functionName === action.functionName
    && queued.argument === action.argument);
};

export const claimNextAction = (state, workerId, now = Date.now(), spacingMs = 1200) => {
  const head = state.actionQueue?.[0] ?? null;
  const lock = state.actionLock;
  if (!head || head.workerId !== workerId) return { claimed: null, state };
  if (lock && lock.expiresAt > now) return { claimed: null, state };
  if (Number.isFinite(state.lastActionAt) && now - state.lastActionAt < spacingMs) return { claimed: null, state };
  return {
    claimed: head,
    state: {
      ...state,
      actionLock: { ownerId: workerId, key: head.key, acquiredAt: now, expiresAt: now + 4000 }
    }
  };
};

export const finishAction = (state, key, completedAt = Date.now()) => ({
  ...state,
  actionQueue: (state.actionQueue ?? []).filter((item) => item.key !== key),
  actionLock: null,
  lastActionAt: completedAt
});

export const releaseAction = (state, key) => ({
  ...state,
  actionQueue: (state.actionQueue ?? []).filter((item) => item.key !== key),
  actionLock: null
});
