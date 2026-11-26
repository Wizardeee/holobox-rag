/**
 * The student-facing question caption is built only from words captured from
 * the student's microphone. The assistant's response is supplied to callers so
 * it cannot be accidentally inserted into the caption by a future change.
 */
export interface CaptionInput {
  userTranscript: string;
  assistantResponse: string;
}

export function studentQuestionCaption({ userTranscript }: CaptionInput): string {
  return userTranscript.replace(/\s+/g, ' ').trim();
}

/** A new question replaces the old one; it is never appended to it. */
export function nextUserTranscript(previous: string, recognized: string): string {
  const clean = recognized.replace(/\s+/g, ' ').trim();
  return clean && clean !== previous.trim() ? clean : previous;
}
