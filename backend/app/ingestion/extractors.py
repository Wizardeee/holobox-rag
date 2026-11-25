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


def _is_letter_spaced(segments: list[str]) -> bool:
    """Conservative evidence check: at least one run of 3+ single characters."""
    for segment in segments:
        run = 0
        for token in segment.split(" "):
            if len(token) == 1 and token.isalnum():
                run += 1
                if run >= 3:
                    return True
            else:
                run = 0
    return False


def _join_letter_runs(segment: str) -> str:
    """Join only runs of single-character tokens inside a letter-spaced segment."""
    tokens = segment.split(" ")
    joined: list[str] = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if len(token) == 1 and token.isalnum():
            end = index
            while end + 1 < len(tokens) and len(tokens[end + 1]) == 1 and tokens[end + 1].isalnum():
                end += 1
            if end > index:
                joined.append("".join(tokens[index : end + 1]))
                index = end + 1
                continue
        joined.append(token)
        index += 1
    return " ".join(joined)


def normalize_letter_spacing(text: str) -> str:
    """Restore words in PDFs whose font encoding emitted letters as separate tokens.

    pypdf often emits such PDFs as ``D E E K S H A  A R A L E L I M A T H``:
    single spaces between letters, DOUBLE spaces between words. We use that
    distinction, never remove spaces from ordinary prose, and leave already-
    normal text untouched.

    The function is line-based to preserve paragraphs/bullets and is idempotent.
    """
    if not text:
        return ""
    result: list[str] = []
    for line in text.split("\n"):
        # Double spaces (or tabs) are the word-boundary signal in affected PDFs.
        segments = re.split(r" {2,}|\t+", line)
        if not _is_letter_spaced(segments):
            result.append(line)
            continue
        rebuilt = " ".join(_join_letter_runs(segment) for segment in segments)
        # Reattach punctuation and brackets that the source spaced out.
        rebuilt = re.sub(r"\s+([,.;:!?%)\]])", r"\1", rebuilt)
        rebuilt = re.sub(r"([\(\[])\s+", r"\1", rebuilt)
        # Decimal points between spaced digits: "3 7 . 6" -> "37.6".
        rebuilt = re.sub(r"(\d)\s*\.\s+(\d)", r"\1.\2", rebuilt)
        result.append(rebuilt)
    return "\n".join(result)


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = normalize_letter_spacing(text)
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
