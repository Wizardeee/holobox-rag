import type { CourseInfo } from '../types/api';

export const NO_COURSES_MESSAGE = 'No courses available. Please ask your teacher to create a course.';
export const COURSE_REMOVED_MESSAGE = 'The selected course is no longer available. Please choose another course.';

export interface CourseSelection {
  courseId: string | null;
  removed: boolean;
}

/**
 * Course state is owned by the kiosk UI, never by kiosk-config.json. The
 * current selection is validated against the live course list on every load;
 * a deleted or missing course is replaced by an available one, never reused.
 */
export function resolveCourseSelection(current: string | null, courses: CourseInfo[]): CourseSelection {
  if (!courses.length) return { courseId: null, removed: current !== null };
  if (current && courses.some((course) => course.id === current)) {
    return { courseId: current, removed: false };
  }
  return { courseId: courses[0].id, removed: current !== null && current !== '' };
}

/** Keep a user's manual choice only while that course still exists. */
export function keepManualSelection(
  selected: string | null,
  courses: CourseInfo[],
): string | null {
  return selected && courses.some((course) => course.id === selected) ? selected : null;
}
