from app.services.voice_sessions import VoiceSessionCoordinator


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make_coordinator(clock, *, debounce=1.0, cooldown=15.0):
    return VoiceSessionCoordinator(
        listen_seconds=5.0, debounce_seconds=debounce, cooldown_seconds=cooldown, clock=clock
    )


def test_presence_is_debounced_before_listening():
    clock = Clock()
    coordinator = make_coordinator(clock)
    assert coordinator.presence(True)[0] is False
    clock.advance(0.5)
    assert coordinator.presence(True)[0] is False
    clock.advance(0.5)
    listen, session_id, reason = coordinator.presence(True)
    assert listen is True and session_id and reason == "start_listening"
    assert coordinator.active_session() == session_id


def test_no_duplicate_session_while_one_is_active():
    clock = Clock()
    coordinator = make_coordinator(clock, debounce=0)
    _, session_id, _ = coordinator.presence(True)
    second_listen, second_id, reason = coordinator.presence(True)
    assert second_listen is False
    assert second_id == session_id
    assert reason == "session_active"


def test_rearming_requires_absence_and_cooldown():
    clock = Clock()
    coordinator = make_coordinator(clock, debounce=0, cooldown=10)
    _, session_id, _ = coordinator.presence(True)
    assert coordinator.begin_capture(session_id) is True
    coordinator.finish(session_id, ok=True)

    assert coordinator.presence(False)[2] == "absent"
    assert coordinator.presence(True)[2] == "cooldown"
    clock.advance(10)
    assert coordinator.presence(True)[0] is True


def test_same_person_present_after_answer_does_not_retrigger():
    clock = Clock()
    coordinator = make_coordinator(clock, debounce=0, cooldown=0)
    _, session_id, _ = coordinator.presence(True)
    coordinator.finish(session_id, ok=True)
    clock.advance(60)
    listen, _, reason = coordinator.presence(True)
    assert listen is False
    assert reason == "waiting_for_absence"


def test_capture_can_only_be_claimed_once_and_is_released_on_finish():
    clock = Clock()
    coordinator = make_coordinator(clock, debounce=0)
    _, session_id, _ = coordinator.presence(True)
    assert coordinator.begin_capture(session_id) is True
    assert coordinator.begin_capture(session_id) is False
    coordinator.finish(session_id, ok=False)
    assert coordinator.active_session() is None
    assert coordinator.begin_capture(session_id) is False


def test_intermittent_presence_does_not_start_a_session_before_debounce():
    clock = Clock()
    coordinator = make_coordinator(clock, debounce=1.0)
    coordinator.presence(True)
    clock.advance(0.8)
    coordinator.presence(False)
    clock.advance(1.5)
    assert coordinator.presence(True)[0] is False
    clock.advance(1.0)
    assert coordinator.presence(True)[0] is True
