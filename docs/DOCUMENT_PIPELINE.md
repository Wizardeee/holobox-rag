# Document Ingestion and Retrieval Pipeline

## Intended flow

Teacher uploads → FastAPI validates → file stored under `backend/data/uploads/{id}/` →
SQLite document record (`PROCESSING`) → text extraction → chunking → embeddings →
ChromaDB vectors → SQLite `READY` with `indexed_chunks` → teacher sees searchable
status → student kiosk queries by course → backend filters approved docs →
retrieval → Ollama answer with citations.

All of this happens on the **MacBook backend**. The Windows kiosk only sends
questions and plays the answer audio.

## Root cause of "new document not visible" (fixed)

The upload endpoint had a hash-based duplicate shortcut. When a teacher
re-uploaded the same bytes (for example a corrected copy with the approval
checkbox changed), `Ingestor.ingest()` returned the existing document unchanged.
Its `approved` flag, name and vectors were never updated or reindexed. A document
uploaded as unapproved could therefore stay invisible to students even after a
later "approved" upload. There was also no verification that embeddings were
actually written before the document was marked `READY`, and no observable
indexing state.

## What changed

- Duplicate uploads now update metadata/approval and reindex the existing
  document in place. No duplicate document rows or duplicate chunks are created.
- `Indexer.index_document()` deletes old vectors first, verifies that the number
  of embeddings equals the number of chunks, verifies non-empty consistent
  dimensions, writes vectors, and returns the count actually indexed.
- `Ingestor` only marks a document `READY` when `indexed_chunks == chunk_count`.
  Any extraction/embedding/indexing failure marks it `FAILED`, clears partial
  vectors and stores a short error message.
- `documents.indexed_chunks` column added with safe migration/backfill.
- Structured logs include `document_id`, `course_id`, stage, extracted characters,
  chunk count, indexed count, vector dimension and failures. Document contents,
  passwords, tokens and credentials are never logged.
- Admin Portal shows `indexed X/Y chunks` and the failed-document error.

## Status conventions

Existing statuses are kept: `PROCESSING`, `READY`, `FAILED`. `PROCESSING` covers
extract/embed/index sub-stages (now visible in logs). `approved` is a separate
boolean; a ready but unapproved document is visible to teachers but excluded
from student retrieval.

## Retrieval filters (unchanged security model)

- Student kiosk must send a `course_id`; backend validates it against the kiosk
  credential's permitted courses.
- Retrieval uses SQLite to select documents with `status = READY`, matching
  `course_id`/`subject_id`, and `approved = 1` for kiosk role.
- Only those document IDs are passed to ChromaDB's `where document_id IN [...]`
  filter. No frontend-side filtering is trusted.

## Safe retries

- `POST /api/v1/documents/{id}/reindex` now **re-extracts from the stored
  original file**, replaces stored chunks, then clears and rebuilds vectors. It
  preserves document ID, course, approval, owner and file location. It never
  creates duplicate chunks or vectors.
- Re-uploading identical bytes reuses the same document ID and reindexes.

## Text normalization (PDF letter spacing)

Some PDFs encode word gaps as double spaces and letter gaps as single spaces.
The old `normalize_text()` collapsed both to one space, producing unusable text
such as `D E E K S H A  A R A L E L I`. `normalize_letter_spacing()` now uses
that double-space signal to rebuild words line-by-line, leaves ordinary prose
unchanged, handles punctuation/numbers/bullets and is idempotent. It is applied
before chunking and embedding. Existing affected documents must be reindexed to
repair already-stored chunks and vectors.

## Operational notes

- Newly approved/indexed documents become searchable immediately; no kiosk
  reinstall or rebuild is needed.
- If a teacher sees `FAILED`, check the error and use re-index after resolving
  the cause. If it stays failed, re-upload with a valid file.
- Backend must be restarted after code changes. No frontend restart is needed
  after a teacher upload.
