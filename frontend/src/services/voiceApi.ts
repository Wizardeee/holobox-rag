import type { FilePart } from '../types/api';

/** Request builders for the local camera-presence voice endpoints. */
export function presenceRequest(body: { present: boolean; course_id?: string }) {
  return { method: 'POST', body };
}

export function captureRequest(
  sessionId: string,
  audio: FilePart,
  courseId: string | null,
  language?: string,
) {
  return {
    method: 'POST',
    form: {
      session_id: sessionId,
      audio,
      course_id: courseId ?? undefined,
      language: language || undefined,
    },
  };
}
