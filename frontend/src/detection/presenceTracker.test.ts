import test from 'node:test';
import assert from 'node:assert/strict';
import { canInfer, nextDetectionDelay, PresenceTracker } from './presenceTracker.ts';

const config = { presenceMs: 1200, absenceMs: 3000 };

test('a person must be seen consistently before a greeting is due', () => {
  const tracker = new PresenceTracker(config);
  assert.deepEqual(tracker.update(true, 1000), { present: false, greetingDue: false });
  assert.deepEqual(tracker.update(true, 1900), { present: false, greetingDue: false });
  assert.deepEqual(tracker.update(true, 2200), { present: true, greetingDue: true });
  assert.deepEqual(tracker.update(true, 5000), { present: true, greetingDue: false });
});

test('brief occlusion does not make the person leave', () => {
  const tracker = new PresenceTracker(config);
  tracker.update(true, 0);
  tracker.update(true, 1200);
  assert.equal(tracker.isPresent, true);
  assert.equal(tracker.update(false, 2000).present, true);
  assert.equal(tracker.update(true, 2600).present, true);
  assert.equal(tracker.update(false, 4000).present, true);
  assert.equal(tracker.update(false, 5100).present, true);
  assert.equal(tracker.update(false, 7000).present, false);
});

test('a new visit after leaving produces exactly one more greeting', () => {
  const tracker = new PresenceTracker(config);
  tracker.update(true, 0);
  assert.equal(tracker.update(true, 1200).greetingDue, true);
  tracker.update(false, 2000);
  tracker.update(false, 5100);
  assert.equal(tracker.isPresent, false);
  tracker.update(false, 6000);
  tracker.update(true, 6100);
  assert.equal(tracker.update(true, 7300).greetingDue, true);
});

test('inference is skipped while busy, for stale frames and overlapping runs', () => {
  const frame = {
    detecting: false, streamActive: true, readyState: 2, videoWidth: 640,
    currentTime: 1.1, lastVideoTime: 1,
  };
  assert.equal(canInfer(frame), true);
  assert.equal(canInfer({ ...frame, detecting: true }), false);
  assert.equal(canInfer({ ...frame, streamActive: false }), false);
  assert.equal(canInfer({ ...frame, readyState: 1 }), false);
  assert.equal(canInfer({ ...frame, videoWidth: 0 }), false);
  assert.equal(canInfer({ ...frame, currentTime: 1 }), false);
});

test('detection runs more often while someone is arriving or present', () => {
  const tracker = new PresenceTracker(config);
  assert.equal(nextDetectionDelay(600, tracker, false), 600);
  tracker.update(true, 0);
  assert.equal(nextDetectionDelay(600, tracker, false), 300);
  assert.equal(nextDetectionDelay(600, tracker, true), 1200);
});
