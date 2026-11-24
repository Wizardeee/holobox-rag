import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { useKioskConversation } from '../hooks/useKioskConversation';
import { usePersonDetection } from '../hooks/usePersonDetection';
import { useSettings } from '../hooks/useSettings';
import { api, errorMessage } from '../services/api';
import type { CourseInfo } from '../types/api';
import './kiosk.css';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Ready — tap the microphone to ask a question',
  listening: 'Listening…',
  processing: 'Thinking…',
  speaking: 'Speaking',
  error: 'Something went wrong — you can try again',
};

export function KioskApp() {
  const { settings, update } = useSettings();
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const conversation = useKioskConversation(courseId, settings?.language || undefined);

  const handleGreet = useCallback(() => {
    if (!settings) return;
    void conversation.greet(settings.greetingText);
  }, [conversation.greet, settings]);
  const { cameraStatus } = usePersonDetection(
    settings,
    conversation.state !== 'idle',
    handleGreet,
  );

  useEffect(() => {
    api.listCourses()
      .then((items) => {
        setCourses(items);
        setCourseId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
      })
      .catch((reason) => setLoadError(errorMessage(reason)));
  }, []);

  if (!settings) return <div className="kiosk-boot">Starting Holobox…</div>;

  const courseName = courses.find((item) => item.id === courseId)?.name ?? 'No course selected';

  return (
    <div className="kiosk-root">
      <Avatar state={conversation.state} analyser={conversation.analyser} />

      <header className="kiosk-top">
        <div className="kiosk-brand">HOLOBOX</div>
        <label className="kiosk-course">
          Course
          <select
            value={courseId ?? ''}
            onChange={(event) => {
              const next = event.target.value || null;
              setCourseId(next);
              if (next) void update({ courseId: next });
            }}
          >
            {courses.length === 0 && <option value="">Unavailable</option>}
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
        </label>
        <span className={`kiosk-status status-${conversation.state}`}>{STATUS_LABEL[conversation.state]}</span>
      </header>

      {conversation.state === 'listening' && <div className="kiosk-pulse" aria-hidden="true" />}

      <div className="kiosk-caption" aria-live="polite">
        {conversation.transcript && <p className="kiosk-question">“{conversation.transcript}”</p>}
        {conversation.turn && <p className="kiosk-answer">{conversation.turn.answer}</p>}
        {conversation.turn && conversation.turn.sources.length > 0 && (
          <p className="kiosk-sources">Sources: {conversation.turn.sources.map((s) => s.document_name).join(', ')}</p>
        )}
      </div>

      {(loadError || conversation.error) && (
        <div className="kiosk-error">
          <span>{loadError || conversation.error}</span>
          <button onClick={conversation.retry}>Try again</button>
        </div>
      )}

      <footer className="kiosk-controls">
        {conversation.state === 'speaking' ? (
          <button className="kiosk-stop" onClick={conversation.stopSpeaking}>Stop answer</button>
        ) : conversation.state === 'listening' ? (
          <button className="kiosk-stop" onClick={conversation.stopListening}>Stop listening</button>
        ) : (
          <button
            className="kiosk-mic"
            onClick={() => void conversation.startListening()}
            disabled={!courseId || conversation.state === 'processing'}
          >
            <span className="mic-dot" /> Ask a question
          </button>
        )}
        <span className="kiosk-current-course">Current course: <strong>{courseName}</strong></span>
        {(cameraStatus === 'denied' || cameraStatus === 'unavailable') && settings?.personDetectionEnabled && (
          <span className="kiosk-camera-note">Camera greeting unavailable — you can still ask questions.</span>
        )}
      </footer>
    </div>
  );
}
