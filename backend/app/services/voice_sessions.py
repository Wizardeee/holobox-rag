"""Camera-triggered voice session coordination.

The kiosk owns the microphone; this service only decides when a listening
window should start and guarantees that one session cannot overlap another.
It is in-memory and process-local by design — no database or new dependency.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable
from uuid import uuid4


@dataclass
class _Session:
    id: str
    started_at: float
    state: str  # listening -> processing -> done|failed


class VoiceSessionCoordinator:
    def __init__(
        self,
        *,
        listen_seconds: float = 5.0,
        debounce_seconds: float = 1.0,
        cooldown_seconds: float = 15.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.listen_seconds = listen_seconds
        self.debounce_seconds = debounce_seconds
        self.cooldown_seconds = cooldown_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._current: _Session | None = None
        self._present_since: float | None = None
        self._last_completed_at: float | None = None
        self._rearm_required = False
        self._absence_seen = False

    def presence(self, present: bool) -> tuple[bool, str | None, str]:
        """Return (should_listen, session_id, reason). Never generates an answer."""
        now = self._clock()
        with self._lock:
            if not present:
                self._present_since = None
                if self._rearm_required:
                    self._absence_seen = True
                return False, None, "absent"

            if self._current is not None and self._current.state in {"listening", "processing"}:
                return False, self._current.id, "session_active"
            if self._rearm_required:
                if not self._absence_seen:
                    return False, None, "waiting_for_absence"
                if self._last_completed_at is not None and now - self._last_completed_at < self.cooldown_seconds:
                    return False, None, "cooldown"
                self._rearm_required = False
                self._absence_seen = False
            if self._present_since is None:
                self._present_since = now
            if now - self._present_since < self.debounce_seconds:
                return False, None, "debounce"
            session = _Session(id=uuid4().hex, started_at=now, state="listening")
            self._current = session
            self._present_since = None
            return True, session.id, "start_listening"

    def begin_capture(self, session_id: str) -> bool:
        """Atomically claim an active session for capture/transcription."""
        with self._lock:
            session = self._current
            if session is None or session.id != session_id or session.state != "listening":
                return False
            session.state = "processing"
            return True

    def finish(self, session_id: str, *, ok: bool) -> None:
        with self._lock:
            session = self._current
            if session is None or session.id != session_id:
                return
            session.state = "done" if ok else "failed"
            self._current = None
            self._last_completed_at = self._clock()
            self._rearm_required = True
            self._absence_seen = False

    def active_session(self) -> str | None:
        with self._lock:
            if self._current is not None and self._current.state in {"listening", "processing"}:
                return self._current.id
            return None

    def reset(self) -> None:
        with self._lock:
            self._current = None
            self._present_since = None
            self._last_completed_at = None
            self._rearm_required = False
            self._absence_seen = False
