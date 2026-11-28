import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { useKioskConversation } from '../hooks/useKioskConversation';
import { usePersonDetection } from '../hooks/usePersonDetection';
import { useSettings } from '../hooks/useSettings';
import { api, errorMessage } from '../services/api';
import { studentQuestionCaption } from './transcript';
import {
  COURSE_REMOVED_MESSAGE,
  NO_COURSES_MESSAGE,
  resolveCourseSelection,
} from './courseSelection';
import type { CourseInfo } from '../types/api';
import './kiosk.css';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready — tap the microphone to ask a question',
  listening: 'Listening…',
  processing: 'Thinking…',
  speaking: 'Speaking',
  error: 'Something went wrong — you can try again',
};

// Light refresh for an unattended kiosk; the selector and manual button also refresh.
const COURSE_REFRESH_MS = 30_000;

export function KioskApp() {
  const { settings, reload } = useSettings();
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Course choice lives here, not in kiosk-config.json.
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseNotice, setCourseNotice] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const refreshing = useRef(false);
  const conversation = useKioskConversation(courseId, settings?.language || undefined);

  const presenceInFlight = useRef(false);
  const startAutomaticSession = conversation.startAutomaticSession;
  const handlePresence = useCallback(async (present: boolean) => {
    if (!settings?.backendUrlConfigured || presenceInFlight.current) return;
    presenceInFlight.current = true;
    try {
      const decision = await api.presence({ present, course_id: courseId ?? undefined });
      if (!decision.listen || !decision.session_id) return;
      await startAutomaticSession(decision.session_id, decision.listen_ms);
    } catch {
      // Camera failures are non-fatal; the manual microphone still works.
    } finally {
      presenceInFlight.current = false;
    }
  }, [courseId, settings?.backendUrlConfigured, startAutomaticSession]);
  const { cameraStatus } = usePersonDetection(
    settings,
    conversation.state !== 'idle',
    handlePresence,
  );

  const loadCourses = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setCoursesLoading(true);
    setLoadError(null);
    try {
      const [items] = await Promise.all([
        api.listCourses(),
        api.health().then(() => setOnline(true)).catch(() => setOnline(false)),
      ]);
      setCourses(items);
      setCourseId((current) => {
        const selection = resolveCourseSelection(current, items);
        setCourseNotice(selection.removed ? COURSE_REMOVED_MESSAGE : null);
        return selection.courseId;
      });
    } catch (reason) {
      setOnline(false);
      setLoadError(errorMessage(reason));
    } finally {
      setCoursesLoading(false);
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    if (settings?.backendUrlConfigured) void loadCourses();
  }, [settings?.backendUrlConfigured, loadCourses]);

  // Refresh when the kiosk window regains focus, and gently while idle so a
  // teacher-created course appears without restarting the app.
  useEffect(() => {
    if (!settings?.backendUrlConfigured) return;
    const onFocus = () => void loadCourses();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (conversation.state === 'idle') void loadCourses();
    }, COURSE_REFRESH_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [settings?.backendUrlConfigured, loadCourses, conversation.state]);

  const retry = useCallback(async () => {
    conversation.retry();
    const next = await reload();
    if (next.backendUrlConfigured) await loadCourses();
  }, [conversation, loadCourses, reload]);

  if (!settings) return <div className="kiosk-boot">Starting Holobox…</div>;

  if (!settings.backendUrlConfigured) {
    return (
      <div className="kiosk-setup">
        <h1>Setup required</h1>
        <p>This kiosk needs the address of the Holobox backend computer.</p>
        <ol>
          <li>Open the configuration file with Notepad.</li>
          <li>Set <code>backendUrl</code> to the MacBook address, for example <code>http://192.0.2.10:8000</code>.</li>
          <li>Set <code>kioskToken</code> to the credential supplied by the administrator.</li>
          <li>Save the file, then press “Reload configuration”.</li>
        </ol>
        <code className="kiosk-setup-path">{settings.configPath}</code>
        <div className="kiosk-setup-actions">
          <button onClick={() => void window.holobox.openConfigFile()}>Open configuration file</button>
          <button onClick={() => void retry()}>Reload configuration</button>
        </div>
      </div>
    );
  }

  const courseName = courses.find((item) => item.id === courseId)?.name ?? NO_COURSES_MESSAGE;
  const questionCaption = studentQuestionCaption({
    userTranscript: conversation.userTranscript,
    assistantResponse: conversation.assistantResponse?.answer ?? '',
  });
  const statusText = online === false
    ? 'Backend unavailable — check the network connection'
    : conversation.state === 'idle' && coursesLoading
      ? 'Refreshing courses…'
      : STATUS_LABEL[conversation.state];

  return (
    <div className="kiosk-root">
      <Avatar state={conversation.state} analyser={conversation.analyser} />

      <header className="kiosk-top">
        <div className="kiosk-brand">HOLOBOX</div>
        <label className="kiosk-course">
          Course
          <select
            value={courseId ?? ''}
            onFocus={() => void loadCourses()}
            onMouseDown={() => void loadCourses()}
            onChange={(event) => {
              setCourseId(event.target.value || null);
              setCourseNotice(null);
            }}
          >
            {courses.length === 0 && <option value="">{coursesLoading ? 'Loading…' : 'Choose a course'}</option>}
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </label>
        <button className="kiosk-refresh" onClick={() => void loadCourses()} disabled={coursesLoading}>
          {coursesLoading ? 'Refreshing…' : 'Refresh courses'}
        </button>
        {/* Voice control occupies the former status position at the top-right. */}
        <div className="kiosk-voice-slot">
          {conversation.state === 'speaking' ? (
            <button className="kiosk-stop" onClick={conversation.stopSpeaking}>Stop answer</button>
          ) : conversation.state === 'listening' ? (
            <span className="kiosk-status status-listening">Listening…</span>
          ) : (
            <button
              className="kiosk-mic"
              onClick={() => void conversation.startListening()}
              disabled={!courseId || online === false || conversation.state === 'processing'}
            >
              <span className="mic-dot" /> Ask a question
            </button>
          )}
        </div>
      </header>

      {conversation.state === 'listening' && <div className="kiosk-pulse" aria-hidden="true" />}

      <div className="kiosk-bottom">
      {/* Only the student's own words are shown. The generated answer is played
          as audio and kept in state for logging, never rendered as a caption. */}
      <div className="kiosk-caption" aria-live="polite">
        {questionCaption && <p className="kiosk-question">“{questionCaption}”</p>}
        {conversation.assistantResponse && (
          <div className="kiosk-answer-card">
            <span className="kiosk-answer-label">Answer</span>
            <p className="kiosk-answer">{conversation.assistantResponse.answer}</p>
            {conversation.note && <p className="kiosk-source-note">{conversation.note}</p>}
          </div>
        )}
      </div>
      {conversation.playbackError && <p className="kiosk-playback-note">{conversation.playbackError}</p>}

      {(loadError || conversation.error) && (
        <div className="kiosk-error">
          <span>{loadError || conversation.error}</span>
          <button onClick={() => void retry()}>Try again</button>
        </div>
      )}

      <footer className="kiosk-controls">
        <span className={`kiosk-status kiosk-status-inline status-${online === false ? 'offline' : conversation.state}`}>
          {statusText}
        </span>
        <span className="kiosk-current-course">Current course: <strong>{courseName}</strong></span>
        {courseNotice && <span className="kiosk-camera-note">{courseNotice}</span>}
        {(cameraStatus === 'denied' || cameraStatus === 'unavailable') && settings.personDetectionEnabled && (
          <span className="kiosk-camera-note">Camera listening unavailable — you can still ask questions.</span>
        )}
      </footer>
      </div>
    </div>
  );
}
