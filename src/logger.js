const ALLOWED_FIELDS = new Set([
  "timestamp",
  "level",
  "event",
  "mode",
  "armed",
  "dryRun",
  "courseCode",
  "previousStatus",
  "currentStatus",
  "action",
  "reason",
  "category",
  "slotId",
  "workerPhase",
  "openingTokenMismatch",
  "pageType",
  "failureStage",
  "pagePath",
  "error"
]);

const redact = (value) => String(value ?? "")
  .replace(/(token|cookie|session|jsessionid|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
  .replace(/\b\d{10}\b/g, "[REDACTED_ID]");

const pathFromUrl = (value) => {
  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
};

export const sanitizeLogEntry = (entry) => {
  const candidate = { ...entry };
  if (candidate.pageUrl) candidate.pagePath = pathFromUrl(candidate.pageUrl);
  delete candidate.pageUrl;
  const clean = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (!ALLOWED_FIELDS.has(key) || value === undefined || value === null || value === "") continue;
    clean[key] = key === "error" ? redact(value) : value;
  }
  return clean;
};

const CSV_FIELDS = [
  "timestamp",
  "event",
  "courseCode",
  "level",
  "mode",
  "armed",
  "dryRun",
  "previousStatus",
  "currentStatus",
  "action",
  "reason",
  "category",
  "slotId",
  "workerPhase",
  "openingTokenMismatch",
  "pageType",
  "failureStage",
  "pagePath",
  "error"
];

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export class AuditLogger {
  constructor(storage, maxEntries = 1000) {
    this.storage = storage;
    this.maxEntries = maxEntries;
  }

  async append(entry) {
    const entries = await this.storage.get();
    const next = [...(Array.isArray(entries) ? entries : []), sanitizeLogEntry(entry)].slice(-this.maxEntries);
    await this.storage.set(next);
    return next[next.length - 1];
  }

  async exportJSON() {
    const entries = await this.storage.get();
    return JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
  }

  async exportCSV() {
    const entries = await this.storage.get();
    const rows = (Array.isArray(entries) ? entries : []).map((entry) => CSV_FIELDS.map((field) => csvCell(entry[field])).join(","));
    return [CSV_FIELDS.join(","), ...rows].join("\n");
  }
}
