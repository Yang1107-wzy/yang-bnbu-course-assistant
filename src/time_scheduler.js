const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

export const DEFAULT_SELECTION_WINDOWS = [
  { id: "round-1", label: "第一轮", enabled: true, startText: "2026-07-20T10:00:00", endText: "2026-07-20T13:00:00" },
  { id: "round-2", label: "第二轮", enabled: true, startText: "2026-07-20T15:00:00", endText: "2026-07-20T18:00:00" },
  { id: "round-3", label: "第三轮", enabled: true, startText: "2026-07-21T10:00:00", endText: "2026-07-22T18:00:00" }
];

const pad = (value) => String(value).padStart(2, "0");

export const formatBeijingDateTime = (epochMs) => {
  if (!Number.isFinite(epochMs)) return "";
  const date = new Date(epochMs + BEIJING_OFFSET_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

export const parseBeijingDateTime = (value) => {
  const text = String(value ?? "").trim();
  const match = text.match(DATE_TIME_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const epochMs = Date.UTC(year, month - 1, day, hour - 8, minute, second);
  return formatBeijingDateTime(epochMs) === text ? epochMs : null;
};

export const validateSelectionWindows = (input) => {
  const errors = [];
  if (!Array.isArray(input) || input.length === 0) return { valid: false, errors: ["selection-windows-required"], windows: [] };
  const ids = new Set();
  const windows = input.map((raw, index) => {
    const id = String(raw?.id ?? `window-${index + 1}`).trim();
    const label = String(raw?.label ?? `窗口 ${index + 1}`).trim();
    const enabled = raw?.enabled !== false;
    const startText = String(raw?.startText ?? "").trim();
    const endText = String(raw?.endText ?? "").trim();
    const startAt = parseBeijingDateTime(startText);
    const endAt = parseBeijingDateTime(endText);
    if (!id || ids.has(id)) errors.push(`invalid-or-duplicate-window-id:${id}`);
    ids.add(id);
    if (!label) errors.push(`window-label-required:${id}`);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) errors.push(`invalid-window-time:${id}`);
    else if (endAt <= startAt) errors.push(`window-end-not-after-start:${id}`);
    return { id, label, enabled, startText, endText, startAt, endAt };
  });
  const enabled = windows.filter((window) => window.enabled && Number.isFinite(window.startAt) && Number.isFinite(window.endAt))
    .sort((left, right) => left.startAt - right.startAt);
  if (enabled.length === 0) errors.push("enabled-selection-window-required");
  for (let index = 1; index < enabled.length; index += 1) {
    if (enabled[index].startAt < enabled[index - 1].endAt) errors.push(`overlapping-selection-windows:${enabled[index - 1].id}:${enabled[index].id}`);
  }
  return { valid: errors.length === 0, errors, windows };
};

const normalizedEnabledWindows = (windows) => {
  if (!Array.isArray(windows)) return [];
  if (windows.every((window) => Number.isFinite(window.startAt) && Number.isFinite(window.endAt))) {
    return windows.filter((window) => window.enabled !== false).slice().sort((left, right) => left.startAt - right.startAt);
  }
  const validated = validateSelectionWindows(windows);
  return validated.valid ? validated.windows.filter((window) => window.enabled).sort((left, right) => left.startAt - right.startAt) : [];
};

export const evaluateSchedule = (windows, nowMs) => {
  const enabled = normalizedEnabledWindows(windows);
  const activeWindow = enabled.find((window) => nowMs >= window.startAt && nowMs < window.endAt) ?? null;
  const nextWindow = enabled.find((window) => window.startAt > nowMs) ?? null;
  if (activeWindow) {
    return { phase: "FAST", activeWindow, nextWindow, nextTransitionAt: activeWindow.endAt, complete: false };
  }
  if (!nextWindow) return { phase: "COMPLETE", activeWindow: null, nextWindow: null, nextTransitionAt: null, complete: true };
  const untilStart = nextWindow.startAt - nowMs;
  const phase = untilStart <= 10000
    ? "FAST"
    : untilStart <= 60000
      ? "ACCELERATE"
      : untilStart <= 600000
        ? "PREHEAT"
        : "WAITING";
  return { phase, activeWindow: null, nextWindow, nextTransitionAt: nextWindow.startAt, complete: false };
};

export const pollPhaseFor = ({ mode, schedule, submitting }) => {
  if (submitting) return "PAUSED";
  if (mode === "MANUAL") return "FAST";
  if (mode === "SCHEDULED") return schedule?.phase ?? "WAITING";
  return "STOPPED";
};

const boundedRandom = (random) => Math.min(1, Math.max(0, Number(random?.() ?? Math.random())));
const interpolate = (minimum, maximum, random) => Math.round(minimum + (maximum - minimum) * boundedRandom(random));

export const randomPollDelayMs = ({ phase, category, random }) => {
  const ranges = {
    PREHEAT: [15000, 25000],
    ACCELERATE: [4000, 7000],
    FAST: [1500, 2500]
  };
  const range = ranges[phase];
  if (!range) return null;
  const base = interpolate(range[0], range[1], random);
  const stagger = category === "FE" ? interpolate(0, 350, random) : 0;
  return base + stagger;
};

export const allTargetsRegistered = (targets, statuses) => Array.isArray(targets)
  && targets.length > 0
  && targets.every((target) => {
    const key = target.id ?? `${target.courseCode}:${target.section}`;
    const current = statuses?.[key];
    return (typeof current === "string" ? current : current?.status) === "REGISTERED";
  });
