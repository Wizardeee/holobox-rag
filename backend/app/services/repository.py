"""SQLite persistence for documents, chunks, conversations and messages.

Uses a fresh connection per operation so it is safe to call from FastAPI's
threadpool. No ORM dependency needed for this data volume.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.schemas import DocumentInfo, DocumentStatus, MessageInfo, Scope


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def init(self, seed_courses: list[tuple[str, str]] | None = None) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    owner_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    page_count INTEGER,
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id, scope);
                CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(sha256, owner_id, scope);
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    page_number INTEGER,
                    text TEXT NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_id);
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sources TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
                CREATE TABLE IF NOT EXISTS courses (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS subjects (
                    id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    PRIMARY KEY (course_id, id),
                    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
                );
                """
            )
            # Forward-only migration for databases created before courses existed.
            columns = {row[1] for row in conn.execute("PRAGMA table_info(documents)")}
            for column, definition in {
                "course_id": "TEXT NOT NULL DEFAULT 'general'",
                "subject_id": "TEXT",
                "approved": "INTEGER NOT NULL DEFAULT 1",
                "uploader": "TEXT NOT NULL DEFAULT ''",
                "updated_at": "TEXT",
                "indexed_chunks": "INTEGER NOT NULL DEFAULT 0",
            }.items():
                if column not in columns:
                    conn.execute(f"ALTER TABLE documents ADD COLUMN {column} {definition}")
            conn.execute("UPDATE documents SET course_id='general' WHERE course_id IS NULL OR course_id=''")
            # Backfill observability for documents indexed before this column existed.
            conn.execute(
                "UPDATE documents SET indexed_chunks = chunk_count "
                "WHERE status = 'ready' AND (indexed_chunks IS NULL OR indexed_chunks = 0)"
            )
            for course_id, name in seed_courses or []:
                conn.execute(
                    "INSERT OR IGNORE INTO courses (id, name, active, created_at) VALUES (?, ?, 1, ?)",
                    (course_id, name, utcnow()),
                )

    # --- documents -------------------------------------------------------

    @staticmethod
    def _document(row: sqlite3.Row) -> DocumentInfo:
        keys = row.keys()
        return DocumentInfo(
            id=row["id"],
            name=row["name"],
            scope=Scope(row["scope"]),
            owner_id=row["owner_id"],
            status=DocumentStatus(row["status"]),
            size_bytes=row["size_bytes"],
            sha256=row["sha256"],
            page_count=row["page_count"],
            chunk_count=row["chunk_count"],
            indexed_chunks=row["indexed_chunks"] if "indexed_chunks" in keys else 0,
            error=row["error"],
            created_at=datetime.fromisoformat(row["created_at"]),
            course_id=row["course_id"] if "course_id" in keys else "general",
            subject_id=row["subject_id"] if "subject_id" in keys else None,
            approved=bool(row["approved"]) if "approved" in keys else True,
            uploader=row["uploader"] if "uploader" in keys else "",
            updated_at=(
                datetime.fromisoformat(row["updated_at"])
                if "updated_at" in keys and row["updated_at"]
                else None
            ),
        )

    def create_document(self, document: DocumentInfo) -> None:
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO documents
                   (id, name, scope, owner_id, status, size_bytes, sha256, page_count, chunk_count,
                    indexed_chunks, error, created_at, course_id, subject_id, approved, uploader, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    document.id,
                    document.name,
                    document.scope.value,
                    document.owner_id,
                    document.status.value,
                    document.size_bytes,
                    document.sha256,
                    document.page_count,
                    document.chunk_count,
                    document.indexed_chunks,
                    document.error,
                    document.created_at.isoformat(),
                    document.course_id,
                    document.subject_id,
                    int(document.approved),
                    document.uploader,
                    document.updated_at.isoformat() if document.updated_at else None,
                ),
            )

    def update_document(self, document_id: str, **fields: Any) -> None:
        if not fields:
            return
        assignments = ", ".join(f"{key} = ?" for key in fields)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE documents SET {assignments} WHERE id = ?",
                (*fields.values(), document_id),
            )

    def get_document(self, document_id: str) -> DocumentInfo | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        return self._document(row) if row else None

    def list_documents(
        self,
        owner_id: str | None,
        *,
        course_id: str | None = None,
        subject_id: str | None = None,
        approved_only: bool = False,
    ) -> list[DocumentInfo]:
        if owner_id is None:
            query = "SELECT * FROM documents WHERE 1=1"
            params: list[object] = []
        else:
            query = "SELECT * FROM documents WHERE (owner_id = ? OR scope = 'shared')"
            params = [owner_id]
        if course_id:
            query += " AND course_id = ?"
            params.append(course_id)
        if subject_id:
            query += " AND subject_id = ?"
            params.append(subject_id)
        if approved_only:
            query += " AND approved = 1"
        query += " ORDER BY created_at DESC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [self._document(row) for row in rows]

    def find_by_hash(
        self,
        sha256: str,
        owner_id: str,
        scope: Scope,
        course_id: str | None = None,
    ) -> DocumentInfo | None:
        query = """SELECT * FROM documents
                   WHERE sha256 = ? AND owner_id = ? AND scope = ? AND status != 'failed'"""
        params: list[object] = [sha256, owner_id, scope.value]
        if course_id:
            query += " AND course_id = ?"
            params.append(course_id)
        query += " ORDER BY created_at DESC LIMIT 1"
        with self._connect() as conn:
            row = conn.execute(query, params).fetchone()
        return self._document(row) if row else None

    # --- courses and subjects --------------------------------------------

    def list_courses(self, active_only: bool = True) -> list[dict[str, Any]]:
        query = "SELECT * FROM courses"
        if active_only:
            query += " WHERE active = 1"
        query += " ORDER BY name"
        with self._connect() as conn:
            rows = conn.execute(query).fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "active": bool(row["active"]),
                "created_at": datetime.fromisoformat(row["created_at"]),
            }
            for row in rows
        ]

    def get_course(self, course_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "active": bool(row["active"]),
            "created_at": datetime.fromisoformat(row["created_at"]),
        }

    def create_course(self, course_id: str, name: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO courses (id, name, active, created_at) VALUES (?, ?, 1, ?)",
                (course_id, name, utcnow()),
            )

    def list_subjects(self, course_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM subjects WHERE course_id = ? ORDER BY name", (course_id,)
            ).fetchall()
        return [
            {"id": r["id"], "course_id": r["course_id"], "name": r["name"], "active": bool(r["active"])}
            for r in rows
        ]

    def create_subject(self, course_id: str, subject_id: str, name: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO subjects (id, course_id, name, active) VALUES (?, ?, ?, 1)",
                (subject_id, course_id, name),
            )

    def delete_document(self, document_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        return cursor.rowcount > 0

    def add_chunks(
        self,
        document_id: str,
        chunks: list[tuple[str, int | None, str]],
    ) -> None:
        """Each tuple is (chunk_id, page_number, text)."""
        with self._connect() as conn:
            conn.executemany(
                """INSERT INTO document_chunks (id, document_id, chunk_index, page_number, text)
                   VALUES (?, ?, ?, ?, ?)""",
                [
                    (chunk_id, document_id, index, page, text)
                    for index, (chunk_id, page, text) in enumerate(chunks)
                ],
            )

    def delete_chunks(self, document_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM document_chunks WHERE document_id = ?", (document_id,))

    def get_chunks(self, document_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT id, chunk_index, page_number, text FROM document_chunks
                   WHERE document_id = ? ORDER BY chunk_index""",
                (document_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "chunk_index": row["chunk_index"],
                "page_number": row["page_number"],
                "text": row["text"],
            }
            for row in rows
        ]

    # --- conversations ---------------------------------------------------

    def create_conversation(self, conversation_id: str, owner_id: str, title: str) -> None:
        now = utcnow()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO conversations (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (conversation_id, owner_id, title, now, now),
            )

    def touch_conversation(self, conversation_id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (utcnow(), conversation_id))

    def rename_conversation(self, conversation_id: str, title: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title, utcnow(), conversation_id),
            )

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
            if not row:
                return None
            messages = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
                (conversation_id,),
            ).fetchall()
        return {
            "id": row["id"],
            "owner_id": row["owner_id"],
            "title": row["title"],
            "created_at": datetime.fromisoformat(row["created_at"]),
            "updated_at": datetime.fromisoformat(row["updated_at"]),
            "messages": [
                MessageInfo(
                    id=message["id"],
                    role=message["role"],
                    content=message["content"],
                    sources=json.loads(message["sources"]),
                    created_at=datetime.fromisoformat(message["created_at"]),
                )
                for message in messages
            ],
        }

    def list_conversations(self, owner_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT c.*, COUNT(m.id) AS message_count
                   FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
                   WHERE c.owner_id = ? GROUP BY c.id ORDER BY c.updated_at DESC""",
                (owner_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "created_at": datetime.fromisoformat(row["created_at"]),
                "updated_at": datetime.fromisoformat(row["updated_at"]),
                "message_count": row["message_count"],
            }
            for row in rows
        ]

    def add_message(
        self,
        conversation_id: str,
        message_id: str,
        role: str,
        content: str,
        sources: list[dict[str, Any]],
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (message_id, conversation_id, role, content, json.dumps(sources), utcnow()),
            )
            conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (utcnow(), conversation_id))

    def delete_conversation(self, conversation_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        return cursor.rowcount > 0
