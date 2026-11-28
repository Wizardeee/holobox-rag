import test from 'node:test';
import assert from 'node:assert/strict';
import type { CourseInfo } from '../types/api';
import {
  COURSE_REMOVED_MESSAGE,
  keepManualSelection,
  NO_COURSES_MESSAGE,
  resolveCourseSelection,
} from './courseSelection.ts';

const courses: CourseInfo[] = [
  { id: 'gpu-arch', name: 'GPU Architecture', active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'history', name: 'History', active: true, created_at: '2026-01-01T00:00:00Z' },
];

test('empty course list clears selection and provides the required message', () => {
  assert.deepEqual(resolveCourseSelection('gpu-arch', []), { courseId: null, removed: true });
  assert.match(NO_COURSES_MESSAGE, /Please ask your teacher to create a course/);
});

test('existing selection is kept and never replaced by a hardcoded default', () => {
  assert.deepEqual(resolveCourseSelection('history', courses), { courseId: 'history', removed: false });
  assert.deepEqual(resolveCourseSelection(null, courses), { courseId: 'gpu-arch', removed: false });
});

test('deleted selection is replaced by an available course and reported', () => {
  assert.deepEqual(resolveCourseSelection('deleted-course', courses), { courseId: 'gpu-arch', removed: true });
  assert.match(COURSE_REMOVED_MESSAGE, /no longer available/);
});

test('manual selection is discarded once that course disappears', () => {
  assert.equal(keepManualSelection('history', courses), 'history');
  assert.equal(keepManualSelection('deleted-course', courses), null);
});
