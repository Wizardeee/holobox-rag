"""Upload validation, extraction, chunking and persistence."""

from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

from app.core.config import Settings
from app.ingestion.chunking import chunk_document
from app.ingestion.extractors import extract
from app.models.schemas import DocumentInfo, DocumentStatus, Scope
from app.services.repository import Repository, utcnow


class Ingestor:
    def __init__(self, settings: Settings, repository: Repository) -> None:
        self.settings = settings
        self.repository = repository

    def validate(self, filename: str, content: bytes) -> None:
        suffix = Path(filename).suffix.lower()
        if suffix not in self.settings.allowed_extensions_set:
            raise ValueError(f"Unsupported file type: {suffix or '(none)'}")
        max_bytes = self.settings.max_upload_mb * 1024 * 1024
        if not content:
            raise ValueError("Uploaded file is empty")
        if len(content) > max_bytes:
            raise ValueError(f"File exceeds the {self.settings.max_upload_mb} MB limit")

    def ingest(self, filename: str, content: bytes, scope: Scope, owner_id: str) -> DocumentInfo:
        self.validate(filename, content)
        digest = hashlib.sha256(content).hexdigest()

        duplicate = self.repository.find_by_hash(digest, owner_id, scope)
        if duplicate is not None and duplicate.status == DocumentStatus.READY:
            return duplicate

        document_id = uuid4().hex
        safe_name = Path(filename).name[:200] or "upload"
        upload_dir = self.settings.uploads_dir / document_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        (upload_dir / safe_name).write_bytes(content)

        document = DocumentInfo(
            id=document_id,
            name=safe_name,
            scope=scope,
            owner_id=owner_id,
            status=DocumentStatus.PROCESSING,
            size_bytes=len(content),
            sha256=digest,
            created_at=utcnow(),
        )
        self.repository.create_document(document)

        try:
            extracted = extract(safe_name, content)
            chunks = chunk_document(extracted, self.settings.chunk_size, self.settings.chunk_overlap)
            self.repository.add_chunks(
                document_id,
                [(uuid4().hex, chunk.page_number, chunk.text) for chunk in chunks],
            )
            self.repository.update_document(
                document_id,
                status=DocumentStatus.READY.value,
                page_count=len(extracted.pages),
                chunk_count=len(chunks),
                error=None,
            )
        except Exception as exc:  # keep the record so the user sees a failed ingestion
            self.repository.update_document(
                document_id,
                status=DocumentStatus.FAILED.value,
                error=str(exc)[:500],
            )

        return self.repository.get_document(document_id)  # type: ignore[return-value]

    def delete_files(self, document_id: str) -> None:
        import shutil

        shutil.rmtree(self.settings.uploads_dir / document_id, ignore_errors=True)
