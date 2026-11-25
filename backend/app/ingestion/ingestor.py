"""Upload validation, extraction, chunking, indexing and status reporting."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from uuid import uuid4

from app.core.config import Settings
from app.ingestion.chunking import chunk_document
from app.ingestion.extractors import extract
from app.models.schemas import DocumentInfo, DocumentStatus, Scope
from app.services.repository import Repository, utcnow

logger = logging.getLogger(__name__)


class Ingestor:
    def __init__(self, settings: Settings, repository: Repository, indexer=None) -> None:
        self.settings = settings
        self.repository = repository
        self.indexer = indexer

    def validate(self, filename: str, content: bytes) -> None:
        suffix = Path(filename).suffix.lower()
        if suffix not in self.settings.allowed_extensions_set:
            raise ValueError(f"Unsupported file type: {suffix or '(none)'}")
        max_bytes = self.settings.max_upload_mb * 1024 * 1024
        if not content:
            raise ValueError("Uploaded file is empty")
        if len(content) > max_bytes:
            raise ValueError(f"File exceeds the {self.settings.max_upload_mb} MB limit")

    def _write_upload(self, document_id: str, filename: str, content: bytes, digest: str) -> None:
        upload_dir = self.settings.uploads_dir / document_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        (upload_dir / filename).write_bytes(content)

    def _prepare_content(self, document_id: str, filename: str, content: bytes, digest: str) -> tuple[int, int]:
        """Extract and store chunks if absent. Returns (page_count, chunk_count)."""
        extracted = extract(filename, content)
        characters = sum(len(text) for _, text in extracted.pages)
        if characters == 0:
            raise ValueError("No text could be extracted from the document")
        chunks = chunk_document(extracted, self.settings.chunk_size, self.settings.chunk_overlap)
        if not chunks:
            raise ValueError("Text extraction produced no chunks")
        logger.info(
            "document_pipeline document_id=%s stage=extracted characters=%s chunks=%s",
            document_id,
            characters,
            len(chunks),
        )
        if not self.repository.get_chunks(document_id):
            self.repository.add_chunks(
                document_id,
                [(uuid4().hex, chunk.page_number, chunk.text) for chunk in chunks],
            )
        return len(extracted.pages), len(self.repository.get_chunks(document_id))

    def ingest(
        self,
        filename: str,
        content: bytes,
        scope: Scope,
        owner_id: str,
        *,
        course_id: str = "general",
        subject_id: str | None = None,
        approved: bool = True,
        uploader: str = "",
    ) -> DocumentInfo:
        self.validate(filename, content)
        digest = hashlib.sha256(content).hexdigest()
        safe_name = Path(filename).name[:200] or "upload"

        duplicate = self.repository.find_by_hash(digest, owner_id, scope, course_id)
        if duplicate is not None:
            # Re-upload of the same bytes: update metadata/approval and reindex
            # instead of silently returning a stale, possibly unapproved record.
            document_id = duplicate.id
            logger.info(
                "document_pipeline document_id=%s course_id=%s stage=reupload approved=%s",
                document_id,
                course_id,
                approved,
            )
            self.repository.update_document(
                document_id,
                status=DocumentStatus.PROCESSING.value,
                name=safe_name,
                course_id=course_id,
                subject_id=subject_id,
                approved=int(approved),
                uploader=uploader or owner_id,
                updated_at=utcnow(),
                error=None,
                indexed_chunks=0,
            )
            self._write_upload(document_id, safe_name, content, digest)
            self._finish_indexing(document_id, content, safe_name)
            return self.repository.get_document(document_id)  # type: ignore[return-value]

        document_id = uuid4().hex
        self._write_upload(document_id, safe_name, content, digest)
        document = DocumentInfo(
            id=document_id,
            name=safe_name,
            scope=scope,
            owner_id=owner_id,
            status=DocumentStatus.PROCESSING,
            size_bytes=len(content),
            sha256=digest,
            created_at=utcnow(),
            course_id=course_id,
            subject_id=subject_id,
            approved=approved,
            uploader=uploader or owner_id,
        )
        self.repository.create_document(document)
        logger.info(
            "document_pipeline document_id=%s course_id=%s stage=uploaded bytes=%s approved=%s",
            document_id,
            course_id,
            len(content),
            approved,
        )
        self._finish_indexing(document_id, content, safe_name)
        return self.repository.get_document(document_id)  # type: ignore[return-value]

    def _finish_indexing(self, document_id: str, content: bytes, filename: str) -> None:
        document = self.repository.get_document(document_id)
        if document is None:
            raise ValueError(f"Document {document_id} not found")
        try:
            page_count, chunk_count = self._prepare_content(document_id, filename, content, document.sha256)
            if self.indexer is None:
                raise RuntimeError("No indexer configured")
            indexed = self.indexer.index_document(document_id)
            if indexed != chunk_count:
                raise RuntimeError(f"Indexed {indexed} of {chunk_count} chunks")
            self.repository.update_document(
                document_id,
                status=DocumentStatus.READY.value,
                page_count=page_count,
                chunk_count=chunk_count,
                indexed_chunks=indexed,
                error=None,
                updated_at=utcnow(),
            )
            logger.info(
                "document_pipeline document_id=%s course_id=%s stage=ready indexed=%s/%s",
                document_id,
                document.course_id,
                indexed,
                chunk_count,
            )
        except Exception as exc:
            vector_store = getattr(self.indexer, "vector_store", None)
            if vector_store is not None:
                try:
                    vector_store.delete_document(document_id)
                except Exception:
                    logger.exception("Could not clear partial vectors for %s", document_id)
            self.repository.update_document(
                document_id,
                status=DocumentStatus.FAILED.value,
                error=str(exc)[:500],
                indexed_chunks=0,
                updated_at=utcnow(),
            )
            logger.error(
                "document_pipeline document_id=%s course_id=%s stage=failed error=%s",
                document_id,
                document.course_id,
                str(exc)[:300],
            )

    def reindex(self, document_id: str) -> int:
        """Rebuild embeddings/vectors for an already-ingested document."""
        document = self.repository.get_document(document_id)
        if document is None:
            raise ValueError("Document not found")
        if self.indexer is None:
            raise RuntimeError("No indexer configured")
        count = self.indexer.index_document(document_id)
        self.repository.update_document(
            document_id,
            status=DocumentStatus.READY.value,
            chunk_count=len(self.repository.get_chunks(document_id)),
            indexed_chunks=count,
            error=None,
            updated_at=utcnow(),
        )
        return count

    def delete_files(self, document_id: str) -> None:
        import shutil

        shutil.rmtree(self.settings.uploads_dir / document_id, ignore_errors=True)
