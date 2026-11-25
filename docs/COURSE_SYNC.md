# Course List Synchronization in the Student Kiosk

## Root cause

The backend was correct: `POST /api/v1/courses` persists the course in SQLite with `active=1`, and `GET /api/v1/courses` queries the database on every request, so a newly created course is returned immediately.

The Electron kiosk fetched courses only once in a `useEffect` when it mounted. Courses created later by a teacher were never fetched again, so the `<select>` kept a stale list until the whole application was restarted.

## Fix

`frontend/src/kiosk/KioskApp.tsx`:

- refreshes courses on startup;
- refreshes when the course selector receives focus or mouse-down (i.e. when the student opens it);
- provides a **Refresh courses** button for the administrator;
- refreshes when the kiosk window regains focus;
- polls every 30 seconds only while the avatar is idle (single `GET /api/v1/courses`, no WebSockets);
- preserves the currently selected course if it still exists, otherwise safely selects the first available course;
- keeps a preferred course ID from local settings but discards it if no longer available;
- handles empty lists (`No courses available`), loading (`Loading…` / `Refreshing courses…`), and backend errors (banner + Try again).

`frontend/src/hooks/useKioskConversation.ts`:

- changing `courseId` clears the previous transcript, answer, citations and error, and stops in-flight audio, so switching courses cannot retain stale context.

No backend changes were needed. Course isolation, approval checks and role-based access are unchanged.

## Verification

- Backend: `110 passed` including new `tests/test_course_sync.py` (create/persist/kiosk visibility, teacher-only 403s, duplicate 409).
- Frontend: `npm run build`, `npm run electron:build`, `npm run check:api-types` pass.
- Live Electron (macOS, built frontend): created `Holobox Course Sync Test 2026` and `... B` while the app was running; the list stayed stale until a refresh, then both appeared without restart. Selecting the new course changed the active `course_id`; a voice question returned a citation from a document that existed only in that course. Switching courses cleared the prior answer/citation. Backend stop → clear "Backend unavailable" state; retry → courses restored.

## Deployment note

Because frontend production code changed, a new Windows installer is required before the next Windows deployment. No installer was rebuilt or published in this task.
