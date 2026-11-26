import test from 'node:test';
import assert from 'node:assert/strict';
import { nextUserTranscript, studentQuestionCaption } from './transcript.ts';

test('caption contains only the student question, never the assistant answer', () => {
  const caption = studentQuestionCaption({
    userTranscript: 'What is CUDA?',
    assistantResponse: 'CUDA is a parallel computing platform by NVIDIA.',
  });
  assert.equal(caption, 'What is CUDA?');
  assert.ok(!caption.includes('NVIDIA'));
});

test('caption with no student speech stays empty even when the assistant answered', () => {
  assert.equal(
    studentQuestionCaption({ userTranscript: '', assistantResponse: 'A generated answer.' }),
    '',
  );
});

test('a repeated question replaces stale text and never duplicates it', () => {
  assert.equal(nextUserTranscript('old question', 'new question'), 'new question');
  assert.equal(nextUserTranscript('new question', 'new question'), 'new question');
  assert.ok(!nextUserTranscript('old', 'new question').includes('old'));
});

test('whitespace-only and blank transcriptions do not overwrite the question', () => {
  assert.equal(nextUserTranscript('kept question', '   \n '), 'kept question');
  assert.equal(studentQuestionCaption({ userTranscript: '  spaced\twords ', assistantResponse: '' }), 'spaced words');
});
