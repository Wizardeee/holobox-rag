/**
 * Pure temporal logic for camera presence. Kept free of DOM/MediaPipe so the
 * entry/exit behaviour can be tested with simulated detections.
 */
export interface DetectionConfig {
  presenceMs: number;
  absenceMs: number;
}

export interface DetectionTick {
  present: boolean;
  greetingDue: boolean;
}

export class PresenceTracker {
  private readonly config: DetectionConfig;
  private candidateSince: number | null = null;
  private absentSince: number | null = null;
  private present = false;

  constructor(config: DetectionConfig) {
    this.config = config;
  }

  get isPresent(): boolean {
    return this.present;
  }

  /** True while a candidate is being confirmed or an absence is being tolerated. */
  get confirming(): boolean {
    return this.candidateSince !== null || this.absentSince !== null;
  }

  update(person: boolean, now: number): DetectionTick {
    if (person) {
      this.absentSince = null; // brief occlusion does not count as leaving
      if (!this.present && this.candidateSince === null) this.candidateSince = now;
      if (!this.present && this.candidateSince !== null && now - this.candidateSince >= this.config.presenceMs) {
        this.present = true;
        this.candidateSince = null;
        return { present: true, greetingDue: true };
      }
      return { present: this.present, greetingDue: false };
    }

    this.candidateSince = null;
    if (this.present) {
      if (this.absentSince === null) this.absentSince = now;
      if (now - this.absentSince >= this.config.absenceMs) {
        this.present = false;
        this.absentSince = null;
      }
    }
    return { present: this.present, greetingDue: false };
  }

  reset(): void {
    this.candidateSince = null;
    this.absentSince = null;
    this.present = false;
  }
}

/** Synchronous VIDEO detection must never run twice or reuse a stale frame. */
export function canInfer(frame: {
  detecting: boolean;
  streamActive: boolean;
  readyState: number;
  videoWidth: number;
  currentTime: number;
  lastVideoTime: number;
}): boolean {
  return !frame.detecting
    && frame.streamActive
    && frame.readyState >= 2
    && frame.videoWidth > 0
    && frame.currentTime > frame.lastVideoTime;
}

/** Faster while somebody is arriving/visible, slower when the kiosk is empty. */
export function nextDetectionDelay(baseMs: number, tracker: PresenceTracker, busy: boolean): number {
  if (busy) return baseMs * 2;
  return tracker.isPresent || tracker.confirming ? Math.max(200, Math.round(baseMs / 2)) : baseMs;
}
