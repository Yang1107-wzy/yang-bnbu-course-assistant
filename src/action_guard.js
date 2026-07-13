export class ActionGuard {
  static fromSnapshot(snapshot, config) {
    const guard = new ActionGuard(config);
    if (!snapshot || typeof snapshot !== "object") return guard;
    guard.actionTimes = Array.isArray(snapshot.actionTimes) ? [...snapshot.actionTimes] : [];
    guard.courseActionTimes = new Map(Object.entries(snapshot.courseActionTimes ?? {}));
    guard.lastActionAt = Number.isFinite(snapshot.lastActionAt) ? snapshot.lastActionAt : null;
    guard.consecutiveErrors = Number.isFinite(snapshot.consecutiveErrors) ? snapshot.consecutiveErrors : 0;
    guard.stoppedReason = snapshot.stoppedReason ?? null;
    return guard;
  }

  constructor(config) {
    this.config = config;
    this.actionTimes = [];
    this.courseActionTimes = new Map();
    this.lastActionAt = null;
    this.consecutiveErrors = 0;
    this.stoppedReason = null;
  }

  canAct(courseKey, now = Date.now()) {
    if (this.stoppedReason) return { allowed: false, reason: `panic-stopped:${this.stoppedReason}` };
    if (this.lastActionAt !== null && now - this.lastActionAt < this.config.minimumActionIntervalMs) {
      return { allowed: false, reason: "minimum-action-interval" };
    }
    const courseAt = this.courseActionTimes.get(courseKey);
    if (courseAt !== undefined && now - courseAt < this.config.sameCourseCooldownMs) {
      return { allowed: false, reason: "same-course-cooldown" };
    }
    this.actionTimes = this.actionTimes.filter((time) => now - time < 60000);
    if (this.actionTimes.length >= this.config.maxActionsPerMinute) {
      return { allowed: false, reason: "max-actions-per-minute" };
    }
    return { allowed: true, reason: "allowed" };
  }

  recordAction(courseKey, now = Date.now()) {
    this.actionTimes = this.actionTimes.filter((time) => now - time < 60000);
    this.actionTimes.push(now);
    this.courseActionTimes.set(courseKey, now);
    this.lastActionAt = now;
    this.consecutiveErrors = 0;
  }

  recordError() {
    this.consecutiveErrors += 1;
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      this.panicStop("max-consecutive-errors");
    }
    return { stopped: Boolean(this.stoppedReason), consecutiveErrors: this.consecutiveErrors };
  }

  panicStop(reason = "manual") {
    this.stoppedReason = reason;
  }

  toSnapshot() {
    return {
      actionTimes: [...this.actionTimes],
      courseActionTimes: Object.fromEntries(this.courseActionTimes),
      lastActionAt: this.lastActionAt,
      consecutiveErrors: this.consecutiveErrors,
      stoppedReason: this.stoppedReason
    };
  }
}
