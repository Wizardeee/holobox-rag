import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../services/api';
import { setBrowserToken } from '../services/transport';
import type { CourseInfo, SubjectInfo } from '../types/api';
import { DocumentManager } from './DocumentManager';
import { LoginPage } from './LoginPage';

export function TeacherApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [newCourse, setNewCourse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api.me()
      .then((principal) => {
        if (principal.role !== 'teacher') throw new Error('Teacher access required');
        setAuthenticated(true);
        setDisplayName(principal.display_name);
      })
      .catch(() => setBrowserToken(null))
      .finally(() => setBooting(false));
  }, []);

  const refreshCourses = useCallback(() => {
    api.listCourses()
      .then((items) => {
        setCourses(items);
        setSelected((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    if (authenticated) refreshCourses();
  }, [authenticated, refreshCourses]);

  useEffect(() => {
    if (!selected) return;
    api.listSubjects(selected).then(setSubjects).catch((reason) => setError(errorMessage(reason)));
  }, [selected]);

  if (booting) return <div className="login-wrap">Loading…</div>;
  if (!authenticated) {
    return <LoginPage onLogin={(name) => { setDisplayName(name); setAuthenticated(true); }} />;
  }

  const course = courses.find((item) => item.id === selected);

  return (
    <div className="teacher-shell">
      <header className="teacher-header">
        <div>
          <strong>Holobox Teacher Portal</strong>
          <span>Signed in as {displayName}</span>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setBrowserToken(null);
            setAuthenticated(false);
            setCourses([]);
            setSelected(null);
          }}
        >
          Sign out
        </button>
      </header>
      <div className="teacher-body">
        <aside className="teacher-sidebar">
          <h3>Courses</h3>
          {courses.map((item) => (
            <button
              key={item.id}
              className={selected === item.id ? 'course-item active' : 'course-item'}
              onClick={() => setSelected(item.id)}
            >
              {item.name}
            </button>
          ))}
          <div className="new-course">
            <input placeholder="New course name" value={newCourse} onChange={(event) => setNewCourse(event.target.value)} />
            <button
              className="secondary"
              disabled={!newCourse.trim()}
              onClick={() =>
                api.createCourse({
                  id: newCourse.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                  name: newCourse.trim(),
                })
                  .then(() => { setNewCourse(''); refreshCourses(); })
                  .catch((reason) => setError(errorMessage(reason)))
              }
            >
              Add course
            </button>
          </div>
        </aside>
        <main>
          {error && <div className="teacher-error">{error}</div>}
          {course ? <DocumentManager course={course} subjects={subjects} /> : <p>No courses available.</p>}
        </main>
      </div>
    </div>
  );
}
