# Implementation Status

| Stage | Status | Exit criteria | Result |
|---|---|---|---|
| 0 — Assessment & architecture | COMPLETE | Assessment, structure, roadmap, contract, risks | Approved 2026-11-24; spec committed; decisions in docs/architecture.md |
| 1 — FastAPI foundation | COMPLETE | health + config + errors + tests pass | 12 passed |
| 2 — Document ingestion | COMPLETE | extract/chunk/dedupe/delete tests pass | 28 passed |
| 3 — Embeddings + ChromaDB | COMPLETE | insert/search/filter/delete tests pass | 37 passed |
| 4 — Retrieval + RAG | COMPLETE | retrieval + citation + no-context tests pass | 50 passed |
| 5 — LLM providers | COMPLETE | provider switching + unavailable tests pass | 57 passed |
| 6 — Electron frontend | COMPLETE | app launches, reaches backend | smoke verified |
| 7 — Text chat | COMPLETE | typed question → answer + citations | 58 passed; real integration test |
| 8 — Whisper STT | COMPLETE | audio → editable transcription | 62 passed |
| 9 — Piper TTS | COMPLETE | answer → cached audio, playback | 67 passed; real Piper verified |
| 10 — Voice workflow | COMPLETE | full pipeline + text fallback | 72 passed |
| 11 — Testing/packaging | COMPLETE | suite green, docs complete, Windows prep | 72 passed; builds + docs verified |

## Stage 0 notes

- Greenfield: no prior Holobox code; nothing migrated or deleted. MASTER_SPEC.md committed from the approved inline spec.
- Environment: Python 3.12.4, Node 24.12.0; FastAPI, ChromaDB, sentence-transformers, faster-whisper, pypdf, docx2txt, pytest already installed locally.
- Six added requirements incorporated into docs/architecture.md.
- Autonomous execution through Stage 11 authorized; stage transitions do not require approval.

## Stage 1 report (2026-11-24)

- Implemented: `create_app()` factory, config with `HOLOBOX_*` env overrides and production guard against mock LLM, uniform error envelope, optional bearer token, requester identity, CORS, startup directory creation, full Pydantic API contract in `app/models/schemas.py`, health endpoints.
- Files: `backend/app/main.py`, `backend/app/core/{config,errors,logging,security}.py`, `backend/app/models/schemas.py`, `backend/app/api/{health,router}.py`, `backend/tests/*`, `backend/requirements.txt`, `backend/.env.example`.
- Dependencies: pinned already-installed stack (no new downloads); venv at `backend/.venv` created with `--system-site-packages`.
- Tests: `.venv/bin/python -m pytest tests -q` → **12 passed** (health, CORS, config guards, error envelope, token dependency).
- Known limitations: `/api/v1/query`, documents, voice and conversation routes do not exist yet; contract-level tests for them arrive with their stages. One harmless `python-multipart` PendingDeprecationWarning from installed Starlette.
- Next: Stage 2 — document ingestion.

## Stage 2 report (2026-11-24)

- Implemented: PDF/DOCX/TXT/Markdown extraction with page numbers, word-boundary chunking with overlap, SQLite repository (documents/chunks/conversations/messages), SHA-256 dedupe, ownership-scoped document APIs, deletion with file cleanup, optional bearer token on document routes.
- Files: `backend/app/ingestion/{extractors,chunking,ingestor}.py`, `backend/app/services/{repository,dependencies}.py`, `backend/app/api/documents.py`, `backend/tests/{helpers,test_extractors,test_chunking,test_documents_api,test_repository}.py`.
- Dependencies: none added (pypdf, docx2txt already pinned in Stage 1).
- Tests: `.venv/bin/python -m pytest tests -q` → **28 passed**. Fixed during the stage: missing `/api/v1` route prefix, malformed test PDF header, `created_at` omission in `DocumentInfo`, word-splitting overlap.
- Known limitations: embeddings/vector index not wired yet (Stage 3); no re-index endpoint; extraction of scanned PDFs (images) yields empty text.
- Next: Stage 3 — embeddings and ChromaDB.

## Stage 3 report (2026-11-24)

- Implemented: `EmbeddingProvider` and `VectorStore` interfaces, lazy Sentence Transformers embedder (`all-MiniLM-L6-v2`, 384-dim, normalized), ChromaDB persistent store with cosine space and ownership metadata, idempotent `Indexer`, automatic indexing on upload, vector cleanup on document delete.
- Files: `backend/app/embeddings/{base,sentence_transformers,factory}.py`, `backend/app/vector_db/{base,chroma,factory}.py`, `backend/app/services/indexer.py`, wiring in `main.py`/`ingestor.py`/`documents.py`, `backend/tests/{fakes,test_embeddings,test_vector_db,test_indexer,test_indexing_api}.py`.
- Dependencies: none added; verified ChromaDB 1.0.20 API against the installed package before use. Real embedding model downloaded and verified locally (384-dim).
- Tests: `.venv/bin/python -m pytest tests -q` → **37 passed**. Fast deterministic fakes keep the suite at ~9 s; one test exercises the real model.
- Known limitations: no re-index API yet; no metadata-only re-ranking; no change to retrieval scoring beyond cosine similarity.
- Next: Stage 4 — retrieval and RAG pipeline with citations and no-context handling.

## Stage 4 report (2026-11-24)

- Implemented: scope-filtered retrieval with query embeddings, grounded prompt template, RAG pipeline with source references and strict no-context answer, graceful generation failure handling, conversation persistence, POST `/api/v1/query` with ownership enforcement.
- Files: `backend/app/retrieval/retriever.py`, `backend/app/rag/{prompts,pipeline}.py`, `backend/app/llm/{base,unavailable,factory}.py`, `backend/app/api/query.py`, service wiring, `backend/tests/{test_retriever,test_rag_pipeline,test_query_api}.py`.
- Dependencies: none added.
- Tests: `.venv/bin/python -m pytest tests -q` → **50 passed**. Fixed one incorrect test that matched header and body owners by mistake.
- Known limitations: default provider is explicitly unavailable — answers need Stage 5 providers; no streaming endpoint yet; prompt is a single fixed template.
- Next: Stage 5 — concrete LLM providers and capability endpoint.

## Stage 5 report (2026-11-24)

- Implemented: `MockProvider` (every answer labelled as a development test response, never genuine), generic OpenAI-compatible `HttpProvider` with configurable endpoint/key/model, streaming SSE support, explicit `CollegeProvider` that reports unconfigured with no invented API, provider registry, `GET /api/v1/config/capabilities`. Mock remains refused in production by config validation.
- Files: `backend/app/llm/{mock,http_provider,college,factory}.py`, `backend/app/api/config.py`, `backend/tests/{test_llm_providers,test_capabilities_api}.py`.
- Dependencies: none added (httpx already present).
- Tests: `.venv/bin/python -m pytest tests -q` → **57 passed**. Fixed a recursive monkeypatch in the HTTP provider tests.
- Known limitations: college adapter requires the real API specification; streaming is not yet exposed through the HTTP API; no provider-level retry/backoff.
- Next: Stage 6 — Electron/React frontend with generated API types.

## Stage 6 report (2026-11-24)

- Implemented: Electron main with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, explicit media permission handler, narrow preload bridge, settings persisted in userData, all backend HTTP performed in main over IPC (no CORS, no credentials in renderer). React/TypeScript/Vite UI with Chat, Knowledge Base, History and Settings screens. OpenAPI → TypeScript generation with `npm run generate:api-types` and staleness check `npm run check:api-types`.
- Files: `frontend/{package.json,tsconfig*.json,vite.config.ts,index.html}`, `frontend/electron/{main,preload}.ts`, `frontend/scripts/generate-api-types.mjs`, `frontend/src/**`, `shared/api-contracts/openapi.json`.
- Dependencies: added npm devDependencies (Electron, Vite, React, TypeScript, electron-builder, openapi-typescript) — all declared, no UI framework.
- Verification: `npm run build` and `npm run electron:build` pass; `npm run check:api-types` passes; backend started on 127.0.0.1:8000; Electron process launched successfully; backend log confirmed the renderer's health request arrived via IPC; CSP warning eliminated. GUI interactions were not automated.
- Known limitations: no automated UI test harness yet; conversation/voice endpoints not in the OpenAPI snapshot until Stages 8–11, so their frontend types are currently local interfaces in `src/services/api.ts`.
- Next: Stage 7 — verify the complete text workflow with real components.

## Stage 7 report (2026-11-24)

- Implemented: complete text workflow verified through the real stack (upload → real MiniLM embeddings → real ChromaDB → retrieval → labelled mock answer → citations → deletion). Added a calibrated retrieval score threshold (0.15) so unrelated questions return the honest no-context answer instead of weak matches. Frontend chat, composer, citations, mock banner and conversation wiring were completed in Stage 6.
- Files: `backend/tests/test_real_integration.py`, `backend/app/core/config.py`, `backend/.env.example`.
- Dependencies: none added.
- Tests: `.venv/bin/python -m pytest tests -q` → **58 passed**, including the real-component integration test. Frontend `npm run build` and `npm run check:api-types` passed in Stage 6.
- Known limitations: GUI interaction was not automated; no E2E browser test harness. Voice stages remain.
- Next: Stage 8 — Whisper speech-to-text.

## Stage 8 report (2026-11-24)

- Implemented: `STTProvider` interface, lazy faster-whisper provider (cached `base` model, int8 CPU), POST `/api/v1/transcribe` with format/size validation, explicit language form field, threadpool execution, guaranteed temp-file cleanup and normalized errors. Added configurable `HOLOBOX_STT_*` settings. Frontend microphone hook now sends the configured language and places the editable transcription into the chat composer before submission.
- Files: `backend/app/speech_to_text/{base,whisper,factory}.py`, `backend/app/api/voice.py`, service/dependency/router wiring, `backend/tests/{test_transcribe_api,test_whisper}.py`, `tests/fakes.py`, frontend `useVoice.ts`/`ChatPage.tsx`/generated types.
- Dependencies: none added (faster-whisper and PyAV already installed; cached base model verified working on this M1).
- Tests: `.venv/bin/python -m pytest tests -q` → **62 passed**, including a real faster-whisper transcription. Frontend `npm run build` and `npm run check:api-types` pass.
- Known limitations: no audio-device selection UI; microphone permissions depend on OS/Electron prompts; no VAD or streaming transcription.
- Next: Stage 9 — Piper text-to-speech.

## Stage 9 report (2026-11-24)

- Implemented: `TTSService` interface, Piper service launched as a subprocess with macOS dynamic-library path handling, SHA-256 content-hash WAV caching, POST `/api/v1/synthesize` returning `audio/wav`, graceful 503 when no voice is configured, voice discovery surfaced through capabilities. Frontend synthesis client and playback controls were already wired; regenerated OpenAPI types include `SynthesisRequest`/`TranscriptionResponse`.
- Files: `backend/app/text_to_speech/{base,piper,factory}.py`, `backend/app/api/synthesis.py`, wiring, `backend/tests/{test_synthesis_api,test_piper}.py`, frontend type aliases and client.
- Dependencies: none added. Verified the local maintained Piper binary and `en_US-lessac-medium` voice generate valid WAV audio.
- Tests: `.venv/bin/python -m pytest tests -q` → **67 passed**, including a real Piper generation + cache check. Frontend build and contract check pass.
- Known limitations: one configured voice by default; no audio-device selection; Piper binary is macOS-only here, Windows assets must be provisioned separately.
- Next: Stage 10 — verify the complete voice workflow and text fallback.

## Stage 10 report (2026-11-24)

- Implemented: acceptance tests for the complete sequence (audio → transcription → same RAG query API → answer with citations → WAV audio) and for text-only operation when both voice services fail. Added the missing conversation-history API (create/list/open/delete with ownership enforcement) so the History screen is fully functional, and replaced frontend local conversation types with generated OpenAPI types.
- Files: `backend/tests/test_voice_workflow.py`, `backend/app/api/conversations.py`, `backend/tests/test_conversations_api.py`, router wiring, regenerated `shared/api-contracts/openapi.json` and frontend types, `frontend/src/services/api.ts`, `useChat.ts`, `HistoryPage.tsx`.
- Dependencies: none added.
- Tests: `.venv/bin/python -m pytest tests -q` → **72 passed**. Frontend `npm run build`, `npm run electron:build`, `npm run check:api-types` all pass.
- Known limitations: no automated GUI test; microphone hardware permissions are OS-controlled; streaming is implemented in the HTTP provider but not exposed via a WebSocket endpoint.
- Next: Stage 11 — final verification, documentation, packaging preparation.

## Stage 11 report (2026-11-24)

- Implemented: final documentation (`docs/setup.md`, `docs/api.md`, `docs/deployment.md`, `docs/TROUBLESHOOTING.md`), README refresh, protocol update, contract snapshot regeneration and frontend type regeneration. Windows packaging configuration (electron-builder NSIS) prepared; no Windows testing performed or claimed.
- Files: docs listed above, `README.md`, `shared/communication-protocol/PROTOCOL.md`, regenerated `shared/api-contracts/openapi.json` and frontend generated types.
- Dependencies: none added.
- Tests: backend **72 passed**; frontend `npm run build`, `npm run electron:build`, `npm run check:api-types` pass; Electron smoke launch previously passed with backend health reaching the app via the preload bridge.
- Known limitations: no GUI automation harness; Windows runtime unverified; college LLM adapter awaits real API documentation; WebSocket streaming endpoint not implemented (HTTP provider supports SSE internally).
- Next steps: run on the actual Holobox Windows PC, provision Windows voice assets, and implement the college LLM adapter from its real specification.

## Final state

All 12 stages (0–11) complete. Backend runs; documents upload/index/delete; retrieval returns citations; LLM abstraction degrades honestly; Electron launches; text chat works end to end; Whisper STT and Piper TTS work; the full voice workflow passes; 72 automated tests pass; macOS setup documented; Windows packaging prepared but not verified.

## Post-build fixes (2026-11-24) — Piper configuration and real Ollama LLM

**Piper root cause:** the backend had `env_file=".env"` resolved against the process working directory and no `backend/.env` existed, so `piper_binary`/`piper_voice` were always `None`. The binary path quoted in the report (`~/Desktop/piper/piper`) also does not exist; the installed executable is `~/Desktop/piper/macos-piper/bin/piper` (executable, loads via `@rpath` without extra `DYLD_LIBRARY_PATH`).

**Fix:** anchored the env file to `BACKEND_ROOT / ".env"`, created the gitignored `backend/.env` with real paths, added a `Settings.discover_piper()` fallback for common local locations, and disabled ChromaDB anonymous telemetry. `.env.example` now documents Ollama/Piper placeholders with no machine-specific values committed.

**Ollama selection:** benchmarked all installed chat models with the exact RAG prompt. Selected `llama3.2:latest` (3.2B, 2.6 GB loaded) — correct complete answers with citations in ~5 s, correct refusal on unrelated questions; `gemma3:1b` hallucinated, `llama3.2:1b` was incomplete, `nemotron-3-nano:4b` was correct but 16–25 s due to thinking mode, `qwen3:8b` excluded by size. `nomic-embed-text` was not used. Configured through the existing generic HTTP provider in `.env`; no new provider or dependency added.

**Verification actually performed:**
- `pytest tests -q` → **75 passed** (was 72; 3 new regression tests).
- `/api/v1/config/capabilities` → `active_provider=http`, `llm_configured=true`, `tts_voices=["en_US-lessac-medium"]`, started with no shell exports.
- Real `/api/v1/synthesize` → 200, valid 22,050 Hz mono WAV; repeat request returned byte-identical cached audio.
- Real upload of `GPU_Project_Report.pdf` → 7 pages / 17 chunks; question "How many airports and routes are in the network, and which GPU was used?" → genuine answer "12 airports, 32 directed routes, Tesla T4" with 5 sources, `generation_mode=live`, no mock label. Unrelated question → 0 sources, `no_relevant_context`, no fabrication.
- Real voice chain: Piper question WAV → Whisper transcription → Ollama answer → Piper answer WAV (6.88 s, valid WAV), no mock label.
- Electron via DevTools Protocol: renderer fetched 97,440 WAV bytes through the preload bridge and the `<audio>` element reported `playing`.
- Ollama loaded size measured at 2.6 GB with `ollama ps`; Chroma telemetry POSTs stopped after restart (0 occurrences in new log).

## Runtime bug fix (2026-11-24) — recurring Piper 503

**Reported symptom:** `/api/v1/synthesize` still returned `Piper is not configured (set HOLOBOX_PIPER_BINARY and HOLOBOX_PIPER_VOICE)` even though `backend/.env` held correct paths.

**Root cause reproduced:** shell environment variables take precedence over `.env` in pydantic-settings. A stale `HOLOBOX_PIPER_BINARY=/Users/deekshaa/Desktop/piper/piper` (the nonexistent path quoted in the report) overrides the correct `.env` value; `PiperTTSService.available` then saw a nonexistent binary and emitted exactly that misleading error. Reproduced deterministically with a clean process: correct `.env` → available; stale env var → the reported 503 text. No backend process was found running at investigation time, so no stale process/code was involved.

**Fix:** `Settings.resolve_piper_paths()` now validates configured paths (existence + executable bit), logs and discards unusable values, then falls back to the known local installation. `PiperTTSService` exposes `describe()` for a startup diagnostics log line, validates binary before voice, and raises typed error codes (`tts_binary_not_configured`, `tts_binary_missing`, `tts_binary_not_executable`, `tts_voice_not_configured`, `tts_voice_missing`, `tts_launch_failed`, `tts_timeout`, `tts_generation_failed`, `tts_empty_output`, `tts_invalid_wav`). Full Piper stderr/exceptions go to backend logs only; the client receives a concise, accurate message and code. Voice names without a suffix resolve to `<voice_dir>/<name>.onnx`.

**Verification actually performed:**
- Direct Piper run with real binary/voice and test sentence → exit 0, valid 1-ch 22,050 Hz 2.67 s WAV.
- Backend started with the **stale wrong shell variables still set** → startup warnings + fallback to real paths, `/synthesize` HTTP 200, valid 2.72 s WAV.
- Real RAG query using the uploaded `GPU_Project_Report.pdf` and Ollama `llama3.2:latest` → `generation_mode=live`, 5 citations, answer "12 airports, 32 directed routes, Tesla T4", no mock label; answer synthesised to a valid 7.44 s WAV.
- Electron via DevTools Protocol → renderer fetched 97,440 WAV bytes through the preload bridge, `<audio>` reported `playing`.
- Backend `pytest tests -q` → **83 passed** (8 new regression tests covering env-file loading, stale-env fallback, missing/non-executable paths, subprocess failure, timeout, invalid WAV and API error-code propagation). Frontend `npm run build`, `npm run electron:build`, `npm run check:api-types` pass.

## College integration (Stages A–G, 2026-11-24)

- **A Inspection:** repository and `sabrina_3d_avatar.glb` inspected; report in `docs/AVATAR_INSPECTION.md`. Asset is a Skinned GLB with 83 joints, one Idle clip, zero morph targets and no jaw bone.
- **B Backend:** teacher/kiosk auth (PBKDF2 + signed tokens), courses/subjects, document metadata (course/subject/approved/uploader), reindex/replace/approve, course-filtered retrieval. Migrated SQLite forward without data loss.
- **C Teacher portal:** new `teacher.html` Vite entry, login, course/subject management, upload/status/approve/reindex/replace/delete. Browser login and document listing verified via Chrome CDP.
- **D Student kiosk:** fullscreen Electron kiosk only; teacher screens removed from bundle; course selector; idle/listening/processing/speaking/error states; single audio owner.
- **E Avatar:** Three.js renderer + `AvatarController`; GLB loaded in Electron; amplitude-driven speaking fallback (no mouth controls in asset).
- **F LAN:** `docs/deployment.md` with MacBook/Windows split, explicit origins, kiosk env vars, no public exposure.
- **G Tests/builds:** backend **88 passed**; frontend build, Electron build, API-type check pass; live API + Electron CDP + Chrome CDP integration verified. Windows/cross-device and physical microphone NOT RUN.

Full evidence and limitations: `docs/IMPLEMENTATION_REPORT.md`.

## Avatar visual correction (2026-11-25)

- Root causes: `renderer.setSize(..., false)` left a 2×-DPR canvas overflowing and clipped (avatar pushed right); CSP blocked `blob:` fetches for the GLB's 11 embedded textures, so all materials stayed white; lighting (1.6/2.2/1.1, no tone mapping) then blew them out.
- Fixed in `frontend/index.html`, `frontend/src/components/Avatar.tsx`, `frontend/src/kiosk/kiosk.css`. Added `docs/AVATAR_RENDERING_FIX.md` and screenshots in `docs/screenshots/`.
- Verified in Electron via CDP: 8/8 material maps loaded, 0 console errors, canvas CSS size matches layout, centred framing at 1920×1080/1536×864/1366×768, original colours visible, RAG/Ollama/Piper playback `playing`, mic transition to Listening, builds and API-type check pass. No backend or asset changes.

## Avatar animation extension (2026-11-25)

- Added runtime lip morph (`src/avatar/mouthMorph.ts`) driven by the existing Piper analyser; mouth opens/closes with speech and closes on stop. Added eye-bone cursor tracking in `AvatarController` using camera-ray gaze, ±14° clamp and post-mixer assignment; pointer listeners in `Avatar.tsx` with cleanup.
- Verified in Electron: real Piper WAV drove mouthOpen 0→0.73→0 and back to 0 on stop; eyes tracked left/right/up/down and returned to rest; real pointer events produced correct NDC and cleared on leave; 0 console errors; builds/type checks pass. Evidence in `docs/AVATAR_ANIMATION.md` and `docs/screenshots/`.
- Not phoneme lip sync (asset has no visemes/jaw); no blinking (no eyelid controls); Windows untested.

## Optional camera greeting (2026-11-25)

- Added `src/hooks/usePersonDetection.ts` using locally bundled MediaPipe Tasks Vision `ObjectDetector` + EfficientDet-Lite0 (4.4 MB) at 1 fps; COCO `person` only, no identity/face recognition, no frames leave the device.
- Added presence state machine (presence/absence confirmation, single greeting per visit), optional startup with graceful failure (no camera/permission/model → disabled, no repeated prompts), camera cleanup, and local `holobox://assets/` protocol in Electron main for bundled WASM/model files.
- Added greeting playback to `useKioskConversation` reusing the single Piper audio element/analyser; guards prevent overlap, answering interruption and recording interference. Added configurable settings/env vars and a subtle unavailable note in the kiosk UI.
- Verified: fake-camera person→blank→person sequence produced exactly one greeting per visit and no repeats; overlap/answer guards refused greetings; permission-denied injection produced one prompt, friendly note and working microphone; camera-less/disabled mode left kiosk fully functional; production build contains all 26 MB of local assets; 0 console errors; final smoke with real detector passed. No installer created.

## Windows kiosk installer (2026-11-25)

- Packaging: added `main`, product name `Holobox Kiosk`, appId `com.holobox.kiosk`, x64 NSIS target, icon, Start Menu + optional desktop shortcuts, `installer/` output. Added `npm run dist:win`.
- Runtime config: packaged app has no localhost default. Operator edits `%APPDATA%\Holobox Kiosk\kiosk-config.json` (created on first run) for `backendUrl`, `kioskToken`, `courseId`. Main process keeps the token; renderer receives only non-secret settings. Added setup screen, config-file open button, validated IPC and offline status/retry.
- Built installer: `frontend/installer/Holobox-Kiosk-0.1.0-x64.exe` (~98 MB, SHA-256 `66c3728a...08c1d`, NSIS/PE32 stub, x64 app binary). Verified asar contains avatar, MediaPipe model/WASM, React/Three bundles and no backend/.env/AI files or secrets.
- Verification: backend 88 tests pass; frontend build/typecheck/contract check pass; first-run setup screen and generated config verified; configured launch shows courses and avatar; renderer sees no token/URL; backend-offline shows clear status without crash; installer built successfully on macOS. Windows hardware execution NOT performed (no Windows PC here).

## Cross-platform configuration fix (2026-11-25)

- Root causes: installer commit used `VITE_DEV_SERVER_URL` to decide dev mode, so `npm run electron` on macOS had no backend URL and showed the Windows setup screen; Electron used the generic `Application Support/Electron` userData dir.
- Fixed `frontend/electron/main.ts`: platform chosen with `app.isPackaged`; explicit `Holobox Kiosk` userData dir on macOS/Windows; separate dev config (`kiosk-config.dev.json`, localhost default, dev token fallback from local `backend/.env`) and production config (`kiosk-config.json`, no localhost fallback); safe migration of legacy configs without overwrite; app:info exposes paths for verification.
- Version bumped to 0.1.1. New installer `frontend/installer/Holobox-Kiosk-0.1.1-x64.exe`, SHA-256 `4d828bdfbdf821d82d6e8736f35b30cd319377a98306d448f04cfd74e5b802c3`. Old v0.1.0 installer retained and byte-identical (`66c3728a...08c1d`).
- Verified on macOS: backend 88 tests pass; frontend build/electron build/API checks pass; dev launch with no env shows kiosk UI, correct app-specific config path, courses load, mic transitions work, backend-offline status/graceful failure works; packaged asar contains fixed main logic, avatar/MediaPipe assets and no token. Windows hardware not tested; production setup/persistence logic verified statically and by earlier config-file tests.

## Document ingestion visibility fix (2026-11-25)

- Root cause: hash-based duplicate upload returned an existing document unchanged, so a re-upload with the approval checkbox changed never updated `approved` or reindexed vectors; a ready-but-unapproved document stayed invisible to the kiosk. No verification existed that embeddings were written before `READY`.
- Backend changed: duplicate uploads now update metadata/approval and reindex in place; `Indexer` verifies vectors count/dimension, clears old vectors first and logs stage data; `Ingestor` marks `READY` only when `indexed_chunks == chunk_count`, else `FAILED` with partial vectors cleared; added `indexed_chunks` with migration/backfill; reindex sets chunk/index counts; structured stage logging.
- Frontend changed: Admin Portal shows `indexed X/Y chunks`. API contract regenerated. Version bumped to 0.1.2.
- Tests: backend 96 passed (new E2E pipeline, duplicate-approval, embedding-failure, retry, approval/course isolation tests); frontend build/electron build/API type check pass. Real Ollama E2E: unique ZEBRA-9901 doc uploaded unapproved then re-uploaded approved -> same ID, approved=True, 384-dim vector in ChromaDB, kiosk query returned the answer "37.6 degrees Celsius" with correct citation; other course returned 0 sources; nonexistent course 404.
- New installer: `frontend/installer/Holobox-Kiosk-0.1.2-x64.exe`, SHA-256 `f38e31885e146c0bd52e44b6c7af2cdb3ba032fd0e04a50d15d4711f87fa6488`. Older installers retained byte-identical.

## PDF letter-spacing fix (2026-11-25)

- Root cause confirmed: pypdf emits double spaces between words and single spaces between letters for the affected PDF; `normalize_text()` collapsed both, destroying word boundaries. Not an upload/approval/course/ChromaDB problem.
- Changed `backend/app/ingestion/extractors.py` with conservative idempotent `normalize_letter_spacing()`; PDF text normalized before chunking. Reindex now re-extracts from the stored original and replaces chunks/vectors safely.
- Tests: extraction regressions + reindex re-extraction added; **106 backend tests passed**.
- Reindexed only `deeksha-resume.pdf` (`e2ad...`) on real data at `backend/data/holobox.db` / `backend/data/chroma`; 5 bad chunks → 3 normalized chunks; still ready/approved/general course `gpu-architecture`.
- Retrieval before: hackathons 0 hits; projects retrieved wrong GPU doc (0.173). After: hackathons resume ranks #1 at 0.416; projects resume #1 at 0.490; API cites `deeksha-resume.pdf` and answers from it. Unrelated question and other-course checks still pass. No threshold change. No frontend/installer changes; no push.

## Course list synchronization (2026-11-25)

- Root cause: KioskApp fetched `/api/v1/courses` only on mount; backend correctly persisted and returned new courses on every request. Verified live: course created while kiosk running did not appear until a refresh.
- Fixed in frontend: refresh on startup, selector focus/mouse-down, manual Refresh courses button, window focus, and 30s idle polling; preserve valid selected course, clear stale conversation on course switch, graceful empty/error/offline states.
- Backend unchanged. Tests: 110 passed (4 new course-sync tests). Frontend build/electron build/API type check pass. Live Electron verified new courses appear without restart, selection changes active course, cross-course citation correct, switching clears stale context, backend outage/retry works.
- Installer needs rebuilding before next Windows deployment; not performed. Not pushed.

## Release v0.1.3 (2026-11-25)

- Includes PDF letter-spacing normalization, safe re-extraction on reindex, and dynamic course-list synchronization in the kiosk.
- Verification: backend 110 passed; frontend build/electron build/API type check pass; Windows x64 NSIS installer built and statically validated (avatar + MediaPipe assets present, no secrets/databases/documents in asar, no localhost production fallback).
- Installer: `frontend/installer/Holobox-Kiosk-0.1.3-x64.exe`, SHA-256 `cf5b07ab995d384048a24b4603154382d1236c76b9a85341481ea40a0c6a0ece`. Older installers retained.
- Security audit: no secrets in current tree or Git history; `.env`, DB, ChromaDB, uploads and installer remain gitignored.
- Windows physical hardware testing not performed.

## Latest stage report

_Release v0.1.3 source verified and installer built; publication pending push/release._
