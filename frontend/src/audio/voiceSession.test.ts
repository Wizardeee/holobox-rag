import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartVoiceSession, level, shouldStopManualRecording, updateManualVad } from './voiceSession.ts';

const limits = { silenceMs: 1200, noSpeechMs: 5000, maxMs: 30000 };
const threshold = 0.02;

test('brief pauses do not stop an active sentence', () => {
  const state = { startedAt: 0, lastVoiceAt: null, heardSpeech: false };
  updateManualVad(state, 100, 0.1, threshold);
  assert.equal(shouldStopManualRecording(state, 600, 0.001, threshold, limits), false);
  updateManualVad(state, 700, 0.08, threshold);
  assert.equal(shouldStopManualRecording(state, 1200, 0.001, threshold, limits), false);
  assert.equal(shouldStopManualRecording(state, 2000, 0.001, threshold, limits), true);
});

test('silence with no speech stops after five seconds', () => {
  const state = { startedAt: 0, lastVoiceAt: null, heardSpeech: false };
  assert.equal(shouldStopManualRecording(state, 4900, 0.001, threshold, limits), false);
  assert.equal(shouldStopManualRecording(state, 5000, 0.001, threshold, limits), true);
});

test('recording is capped at the maximum duration', () => {
  const state = { startedAt: 0, lastVoiceAt: 29000, heardSpeech: true };
  assert.equal(shouldStopManualRecording(state, 30000, 0.1, threshold, limits), true);
});

test('manual and camera sessions cannot overlap or interrupt speech', () => {
  assert.equal(canStartVoiceSession(false, 'idle', false), true);
  assert.equal(canStartVoiceSession(true, 'idle', false), false);
  assert.equal(canStartVoiceSession(false, 'speaking', false), false);
  assert.equal(canStartVoiceSession(false, 'processing', false), false);
  assert.equal(canStartVoiceSession(false, 'idle', true), false);
});

test('RMS stays near zero for silence and rises for speech', () => {
  const silent = new Uint8Array(1024).fill(128);
  const loud = new Uint8Array(1024).map((_, i) => 128 + Math.round(80 * Math.sin(i * 0.3)));
  assert.ok(level(silent) < 0.001);
  assert.ok(level(loud) > threshold);
});
