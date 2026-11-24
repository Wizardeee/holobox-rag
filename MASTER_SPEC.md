# HOLOBOX RAG — MASTER PROJECT SPECIFICATION

## 1. Project Overview

Build a standalone, desktop-based, voice-enabled Retrieval-Augmented Generation (RAG) application for the Holobox project.

The initial application should function as a conventional document-based AI assistant. Users should be able to upload documents, ask questions about their contents through text or voice, receive contextually relevant answers, view document citations, and listen to AI-generated spoken responses.

The application will initially run on a MacBook during development. Eventually, it will be deployed as a standalone Windows desktop application on the Holobox's Windows PC.

The application must be designed so that the college-provided external LLM can be integrated later without restructuring the entire application.

### Core architectural philosophy

- Electron desktop application = User interface.
- Python FastAPI backend = Application and RAG processing.
- Whisper = Speech-to-text.
- Piper = Text-to-speech.
- Vector database = Document knowledge storage.
- LLM provider interface = Replaceable AI model integration.

The frontend and backend must be independent components communicating through APIs.

## 2. Deployment Architecture

Development environment:
- Development machine: MacBook.
- Frontend: Electron desktop application.
- Backend: Python + FastAPI.
- Communication: HTTP APIs, with WebSocket support where appropriate.
- Storage: Local application data and vector database.

Eventual Holobox deployment:
- Holobox computer: Windows PC.
- User interface: Standalone Electron desktop application.
- AI backend: Laptop or another designated server.
- Communication: Local network using HTTP/WebSocket.
- The Holobox application must not require users to open Chrome or navigate to a website.

The laptop acts as the AI brain, while the Holobox acts as the user-facing interface.

Design the communication layer so that the backend can eventually run on a different computer without changing frontend functionality.

Do not introduce Unity.

## 3. Frontend — Electron Desktop Application

Use Electron, React, TypeScript, Vite, and a clean modular component architecture. Modern, minimal desktop interface.

### Main screens

**A. Chat** — Conversational AI interface; text input; microphone button; send button; AI response display; loading and processing indicators; retrieved document references; listen to generated responses; stop audio playback; display transcription before submission where appropriate.

**B. Knowledge Base** — Upload documents; view uploaded documents; ingestion status; delete documents; document metadata; shared knowledge base and user-uploaded documents with appropriate access separation.

**C. Conversation History** — Store previous conversations locally; reopen; start new; preserve relevant document references.

**D. Settings** — Backend URL; LLM provider; enable/disable voice input; enable/disable spoken responses; select STT/TTS models or voices; audio settings.

### Electron security requirements

- Enable context isolation.
- Disable Node.js integration in the renderer.
- Use a secure preload script.
- Expose only necessary APIs to the renderer.
- Request microphone permissions explicitly.
- Do not expose backend secrets or API credentials to frontend code.
- Behave like a desktop application, not a website.

## 4. Backend — Python + FastAPI

Build an independent backend with clear service and repository boundaries. Suggested modules: API routes, document ingestion, text extraction, text chunking, embedding generation, vector database management, retrieval, RAG orchestration, LLM provider integrations, speech-to-text, text-to-speech, conversation management, configuration and logging.

### Document ingestion

Initially support PDF, DOCX, TXT, Markdown. Keep architecture extensible. Pipeline: receive upload → validate type and size → extract text → preserve metadata including page numbers where possible → chunk → generate embeddings → store chunks, embeddings, metadata in vector database → report status. Prevent duplicate ingestion where practical. Allow deletion to remove associated vector entries.

### Embeddings

Use a local Sentence Transformers embedding model initially. Independent of the LLM provider. Do not assume the college's LLM also provides embeddings. Model configurable.

### Vector database

Use ChromaDB initially. Store Document ID, Chunk ID, extracted text, embedding, document name, page number, relevant metadata, knowledge-base ownership/scope. Keep operations behind an abstraction.

### Retrieval

Process query → embed → retrieve relevant chunks → rank/filter → construct context → generate answer using retrieved context → return answer and source references.

Do not allow the system to present unsupported information as though it came from uploaded documents. When relevant information is unavailable, clearly communicate the limitation. Return document name, page number, relevant excerpt.

## 5. LLM Integration Architecture

The college will eventually provide an external LLM hosted on its own servers. That service is not currently accessible. Build a provider-independent integration layer.

Common interface for: sending prompts, receiving responses, streaming where supported, errors and timeouts, endpoint and auth configuration.

Provider implementations: (1) mock/test provider, (2) optional temporary local or external provider, (3) future college-hosted provider.

Do not hardcode a particular LLM. Do not invent college API endpoints, authentication methods or request formats. When documentation is available, implement against actual specifications. The application must remain functional as a document-management and retrieval system even when no LLM provider is configured.

## 6. Voice Input — Speech-to-Text

Use Whisper (prefer faster-whisper or whisper.cpp after checking compatibility). Pipeline: mic click → Electron permission → audio capture → send to backend → transcribe → return → user reviews/edits → submit as normal RAG question.

Requirements: permission handling, recording indicators, start/stop, error handling, transcription status, editable transcription, configurable language. Keep STT independent of RAG and LLM processing.

## 7. Voice Output — Text-to-Speech

Use Piper (maintained project; verify installation, licensing, voice models). Pipeline: answer → Piper → audio → return/stream → Electron plays.

Requirements: configurable voice model, playback controls, stop, loading indicators, error handling, caching for identical responses. Keep TTS independent of the LLM.

## 8. Complete Voice + RAG Pipeline

Text: typed question → RAG retrieval → LLM → answer displayed.
Voice: speech → mic capture → Whisper → transcription → RAG → LLM → answer displayed → Piper → audio playback.

Text and voice questions must use the same RAG pipeline after transcription.

## 9. Storage and Privacy

Prioritize local storage: uploaded documents, vector database, conversation history, application settings, audio files only when needed with clear retention. Do not silently upload documents to external services. Do not send documents or user audio to cloud services without making that clear. Keep temporary audio files controlled and clean them up. Do not store API credentials in frontend code.

## 10. Suggested Project Structure

```
holobox-rag/
├── frontend/ {electron/, src/{components,pages,services,hooks,types,audio}/, public/, package.json}
├── backend/  {app/{api,core,ingestion,embeddings,vector_db,retrieval,rag,llm,
│              speech_to_text,text_to_speech,conversations,models,services}/, tests/, requirements.txt}
├── shared/   {api-contracts/, communication-protocol/}
├── docs/     {architecture.md, setup.md, api.md, deployment.md}
├── MASTER_SPEC.md
└── README.md
```

Suggested structure, not a reason to create unnecessary folders or abstractions.

## 11. Hardware and Resource Considerations

MacBook Air M1, 8 GB RAM. Optimize memory: avoid large local LLMs, use lightweight embeddings, appropriate Whisper sizes, avoid loading multiple large models simultaneously, CPU-compatible configurations, configurable model selection. The college-hosted LLM will eventually handle answer generation.

## 12. Future Compatibility — Holobox

No advanced 3D avatar rendering initially. Design the backend so a future avatar client can connect through APIs: submit text questions, submit audio for transcription, receive transcriptions, retrieve RAG answers, receive generated audio, receive streaming responses where supported.

Later the client can implement human avatar rendering, lip sync, expressions, gestures, spoken interaction. Do not introduce avatar-specific dependencies into the core RAG system.

## 13. Development Priorities

1. Project structure and architecture. 2. FastAPI backend foundation. 3. Document ingestion. 4. Embeddings and vector database. 5. Retrieval and RAG pipeline. 6. Replaceable LLM integration. 7. Electron frontend foundation. 8. Frontend/backend integration. 9. Text-based chat. 10. Whisper voice input. 11. Piper voice output. 12. Conversation history. 13. Testing, optimization, packaging. 14. Windows deployment preparation.

## 14. Quality Requirements

Modular maintainable code, clear separation, type-safe frontend, validated API inputs, proper error handling, unit and integration tests, no hardcoded secrets, no unnecessary dependencies, no placeholder functionality presented as completed, no fabricated LLM responses in production mode, clear setup and deployment instructions. Test on macOS first, prepare for Windows later.

## Final Objective

Build a functional, standalone, voice-enabled RAG desktop assistant supporting document uploads, semantic retrieval, text questions, voice questions, source citations, and spoken AI responses. Architecture must make it straightforward to connect the college-provided external LLM and eventually the Holobox avatar client. Prioritize a working, reliable RAG application over premature avatar features or unnecessary complexity.
