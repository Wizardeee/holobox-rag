import test from 'node:test';
import assert from 'node:assert/strict';
import { captureRequest, presenceRequest } from './voiceApi.ts';

const audio = { fileName: 'question.webm', type: 'audio/webm', data: [1, 2, 3] };

test('presence request matches the backend schema', () => {
  const request = presenceRequest({ present: true, course_id: 'gpu-architecture' });
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, { present: true, course_id: 'gpu-architecture' });
});

test('capture request carries session_id and the audio file part', () => {
  const request = captureRequest('session-1', audio, 'gpu-architecture', 'en');
  assert.equal(request.method, 'POST');
  assert.equal(request.form.session_id, 'session-1');
  assert.deepEqual(request.form.audio, audio);
  assert.equal(request.form.course_id, 'gpu-architecture');
  assert.equal(request.form.language, 'en');
});

test('optional capture fields are omitted when absent', () => {
  const request = captureRequest('session-2', audio, null);
  assert.equal(request.form.course_id, undefined);
  assert.equal(request.form.language, undefined);
});
