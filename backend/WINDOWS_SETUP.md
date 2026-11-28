# Backend setup (Windows / MacBook)

The backend stays on the MacBook or Windows host; the Holobox mini PC runs only the Electron kiosk.

## 1. Install the local model

On the machine that runs the backend:

```powershell
ollama pull qwen3:14b
```

Ollama's OpenAI-compatible endpoint must be available at `http://127.0.0.1:11434/v1`.
No model is downloaded automatically when the backend starts. `qwen3:14b` fits comfortably
in 16 GB VRAM and also works on CPU at reduced speed.

## 2. Backend environment

Use `.env.example` as the template. The relevant settings are:

```text
HOLOBOX_LLM_PROVIDER=http
HOLOBOX_LLM_BASE_URL=http://127.0.0.1:11434/v1
HOLOBOX_LLM_MODEL=qwen3:14b
HOLOBOX_LLM_CONTEXT_TOKENS=8192
HOLOBOX_RESPONSE_LANGUAGE=English
HOLOBOX_VOICE_LISTEN_SECONDS=5
HOLOBOX_VOICE_PRESENCE_DEBOUNCE_SECONDS=1
HOLOBOX_VOICE_PRESENCE_COOLDOWN_SECONDS=15
```

Keep the existing `HOLOBOX_KIOSK_TOKEN`, teacher auth and Piper path settings unchanged.
Paths are resolved relative to the backend folder or from environment variables; there are
no machine-specific absolute paths in source.

## 3. Start the backend

```powershell
cd <project>\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On macOS the equivalent command is unchanged:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 4. Camera-triggered voice sessions (frontend integration still required)

The backend cannot access a microphone attached to the Windows kiosk. The kiosk must:

1. `POST /api/v1/voice/presence` with `{"present": true}` using the existing kiosk token.
2. If `listen` is `true`, record microphone audio for `listen_ms` (default 5000 ms) using
   the existing MediaRecorder code, then stop cleanly.
3. `POST /api/v1/voice/capture` as multipart form data with `session_id`, `audio`,
   optional `course_id`, `conversation_id` and STT `language`.
4. Decode `audio_base64` as a WAV and play it through the existing audio element/analyser.
   Display `answer` naturally; `text` is the recognised student question.

Presence alone never generates an answer. The backend debounces entry, refuses overlapping
sessions, requires an absence event before re-arming, and applies a cooldown after each
session. Empty speech returns `status: "no_speech"` with no answer and no audio. TTS failure
leaves the text answer intact in the response.

The existing manual endpoints (`/api/v1/transcribe`, `/api/v1/query`, `/api/v1/synthesize`)
are unchanged and continue to work.
