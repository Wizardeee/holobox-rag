# Camera Person Detection and Automatic Greeting

## What it does

The student kiosk can optionally watch its local camera, detect the presence of a
**person**, and greet them once with Piper speech:

> "Hi, how can I help you today?"

This module is entirely optional. If no camera exists, permission is denied, the
WASM/model fails to load, or detection is disabled, the kiosk behaves exactly as
before: microphone, Whisper, RAG, Ollama, Piper, avatar animation and voice
answers remain fully functional.

## Technology and where it runs

| Item | Choice |
|---|---|
| Runtime | `@mediapipe/tasks-vision` `ObjectDetector` in the Electron renderer |
| Model | EfficientDet-Lite0 (uint8), 4.4 MB, COCO classes, `person` class used |
| Model source | `https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite` |
| Model SHA-256 | `2e04c53bfeac0ac2a30c057c7e2a777594ce39baaac35a92f74fb1e8c4fc4e0b` |
| Inference | 100% local WASM/CPU (XNNPACK delegate) on the Holobox PC |
| WASM assets | `frontend/public/mediapipe/wasm/` (copied from the npm package; SIMD + no-SIMD fallbacks) |
| Model asset | `frontend/public/mediapipe/models/efficientdet_lite0_uint8.tflite` |

**No frames, photos, audio or video are sent to the MacBook backend or any
external service.** Frames are decoded into the detector and discarded. Nothing
is recorded or saved. There is no face recognition, identity, emotion or
emotion/face identification — only the COCO `person` class from a general object
detector.

The detector runs at a low frame rate (default 1 fps) on a 640×480/10 fps video
stream. It is loaded lazily (dynamic import), so a missing/corrupt model cannot
break kiosk startup. One hidden `<video>` element, one `setInterval`, one camera
stream and one MediaPipe detector are used; all are stopped on shutdown or
unmount.

## Electron asset serving

Packaged Electron apps load from `file://`, which cannot fetch sibling WASM/model
files. `electron/main.ts` registers a local-only, secure custom protocol
`holobox://assets/` mapped to the app's `dist/` (or `public/` in dev). The CSP in
`index.html` allows that local scheme plus `wasm-unsafe-eval`. No network origin
is involved.

## Presence state machine

- Person detected with score ≥ confidence, consistently for `presenceMs` → one greeting.
- Person remains present → no further greeting.
- Person absent for `absenceMs` → visit ends; a later return may greet again.
- Brief detection dropouts do not reset state (absence must be confirmed).
- If the kiosk is busy (answering, listening, speaking), the visit is marked as
  greeted but no greeting is spoken — no interruption of an active answer.
- `greet()` refuses to run if state is not `idle`, if the microphone is
  recording, or if another greeting is in flight.

## Greeting audio

`useKioskConversation.greet()` calls the existing backend `POST /api/v1/synthesize`
with the configured greeting text. The backend caches audio by text hash; the
kiosk also keeps the greeting bytes in memory, so normal repeat visits need no
new request. Audio is played by the **single existing audio element**, through
the existing Web Audio analyser, so the avatar enters its real `speaking` state
and its mouth/head animation follows the actual Piper audio. When playback ends
(or is stopped), the avatar returns to idle.

If synthesis fails, the greeting is silently skipped — it never blocks student
interaction and never falls back to a mocked/pretend sound.

## Configuration

Set in Electron main via environment variables (or edit the local
`userData/settings.json` through the existing settings bridge):

| Setting | Env var | Default |
|---|---|---|
| Enabled | `HOLOBOX_PERSON_DETECTION_ENABLED` | `true` |
| Confidence | `HOLOBOX_PERSON_CONFIDENCE` | `0.5` |
| Detection interval | `HOLOBOX_PERSON_INTERVAL_MS` | `600` (halved while someone is arriving/present) |
| Presence confirmation | `HOLOBOX_PERSON_PRESENCE_MS` | `1200` |
| Absence confirmation | `HOLOBOX_PERSON_ABSENCE_MS` | `3000` |
| Greeting text | `HOLOBOX_GREETING_TEXT` | `Hi, how can I help you today?` |

Disabling via env means no camera permission is requested at all. A denied
permission is terminal (no repeated prompts); a disconnected camera or model
error is retried a bounded number of times with backoff. When unavailable, a
small non-technical note appears in the kiosk footer:
"Camera greeting unavailable — you can still ask questions."

## Windows mini PC testing (before the installer)

1. Start the backend on the MacBook as usual (`uvicorn ... --host 0.0.0.0`).
2. On the Windows PC, set `HOLOBOX_BACKEND_URL` and `HOLOBOX_KIOSK_TOKEN` in
   `kiosk-config.json` (or the environment) and optionally the detection
   variables above. Courses are selected in the kiosk UI.
3. Run `npm run build && npm run electron:build && npm run electron` from the
   `frontend/` folder (installer creation is a separate later task).
4. Allow camera access when prompted by Windows/Electron (the app also grants
   the `media` permission in Electron main).
5. Walk into view for ~3 s → expect one greeting and the avatar speaking.
6. Remain in view → expect no repeat. Leave for >5 s and return → greeting again.
7. Ask a question while answering → greeting must not interrupt.
8. Unplug/deny the camera → kiosk keeps working; footer note appears once.
9. Close the app → confirm the camera indicator light turns off (track cleanup).

## Known limitations

- COCO person detection is approximate: unusual poses, occlusion, very small or
  very distant people, and poor lighting may be missed. It does **not** identify
  who the person is.
- The greeting is triggered by presence only; it is not a response to speech.
- Eyelid/blink controls are absent in the current avatar, so no blink is added.
- Windows hardware/camera behaviour has not been verified here (no Windows PC).
  The MacBook tests used Chromium's fake camera with a synthetic person video.
