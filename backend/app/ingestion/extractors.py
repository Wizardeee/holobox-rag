"""Text extraction for PDF, DOCX, TXT and Markdown.

Each extractor returns pages: (page_number or None, text). PDFs keep real page
numbers; other formats return a single unnumbered page.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import re


@dataclass(frozen=True)
class ExtractedDocument:
    pages: list[tuple[int | None, str]]

    @property
    def text(self) -> str:
        return "\n\n".join(text for _, text in self.pages)


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.rstrip() for line in text.split("\n")).strip()


def _pdf(content: bytes) -> ExtractedDocument:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(content))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = normalize_text(page.extract_text() or "")
        if text:
            pages.append((index, text))
    return ExtractedDocument(pages)


def _docx(content: bytes) -> ExtractedDocument:
    import docx2txt

    text = normalize_text(docx2txt.process(BytesIO(content)) or "")
    return ExtractedDocument([(None, text)] if text else [])


def _plain(content: bytes) -> ExtractedDocument:
    text = normalize_text(content.decode("utf-8", errors="replace"))
    return ExtractedDocument([(None, text)] if text else [])


def extract(filename: str, content: bytes) -> ExtractedDocument:
    """Extract text based on file extension. Raises ValueError for unknown types."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return _pdf(content)
    if suffix == ".docx":
        return _docx(content)
    if suffix in {".txt", ".md", ".markdown"}:
        return _plain(content)
    raise ValueError(f"Unsupported file type: {suffix or '(none)'}")
