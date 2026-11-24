# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Backend health returns but Electron says "Backend offline" | Backend URL wrong or backend not running | Start `uvicorn app.main:app --host 127.0.0.1 --port 8000`; check Settings → Backend URL; click "Test backend connection". |
| Electron shows a blank window | Stale build | Run `npm run build && npm run electron:build`, then relaunch. |
| `unsupported_type` on upload | Extension not in `HOLOBOX_ALLOWED_EXTENSIONS` | Use PDF/DOCX/TXT/MD or update the setting. |
| Document status `failed` | Extraction error (e.g. encrypted/scan-only PDF) | Check `error` in the document list; re-export the file as text-based PDF or TXT. |
| Answer says "I don't have enough information" | No chunk scored above `HOLOBOX_RETRIEVAL_MIN_SCORE` or document is not visible to this user | Lower the threshold slightly, check the user id, confirm the document is `ready` and in the same scope. |
| Answers labelled "DEVELOPMENT TEST RESPONSE" | Mock provider is active | Expected in development. Configure `HOLOBOX_LLM_PROVIDER=http` with a real endpoint for genuine answers. |
| `tts_unavailable` (503) | Piper binary/voice not configured | Set `HOLOBOX_PIPER_BINARY` and `HOLOBOX_PIPER_VOICE` and restart the backend. |
| Microphone records nothing | OS permission not granted or no input device | Grant microphone access to Electron in macOS Privacy settings; select an input device. |
| Transcription fails on WebM | Old decoder | Prefer WAV/Opus; faster-whisper uses PyAV — verify `av` is installed. |
| "Generated API types are outdated" | Pydantic schema changed without regeneration | Run the two contract-generation commands in `docs/api.md`. |
| Mock provider rejected at startup | `HOLOBOX_ENVIRONMENT=production` with `HOLOBOX_LLM_PROVIDER=mock` | Configure a real provider; mock is intentionally forbidden in production. |

Logs are console-only and contain no credentials. Backend data can be reset by deleting `backend/data/` (this removes all documents, vectors, conversations and cached audio).
