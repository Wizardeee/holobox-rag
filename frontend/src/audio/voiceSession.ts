/** Lightweight client-side voice activity detection for manual listening. */

export interface ManualVadState {
  startedAt: number;
  lastVoiceAt: number | null;
  heardSpeech: boolean;
}

export interface ManualVadLimits {
  silenceMs: number;
  noSpeechMs: number;
  maxMs: number;
}

/** Shared guard: manual and camera sessions cannot overlap or interrupt speech. */
export function canStartVoiceSession(active: boolean, state: string, audioPlaying: boolean): boolean {
  return !active && state === 'idle' && !audioPlaying;
}

/** RMS of an 8-bit unsigned time-domain buffer from an AnalyserNode. */
export function level(samples: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = (samples[i] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

/** Decide whether manual recording should stop, based on real elapsed time. */
export function shouldStopManualRecording(
  state: ManualVadState,
  now: number,
  currentLevel: number,
  threshold: number,
  limits: ManualVadLimits,
): boolean {
  const elapsed = now - state.startedAt;
  if (elapsed >= limits.maxMs) return true;
  if (currentLevel >= threshold) return false;
  if (!state.heardSpeech) return elapsed >= limits.noSpeechMs;
  return state.lastVoiceAt !== null && now - state.lastVoiceAt >= limits.silenceMs;
}

export function updateManualVad(state: ManualVadState, now: number, currentLevel: number, threshold: number): void {
  if (currentLevel >= threshold) {
    state.heardSpeech = true;
    state.lastVoiceAt = now;
  }
}
