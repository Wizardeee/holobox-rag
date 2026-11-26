"""Hybrid prompt: grounded in course material, with general-knowledge fallback."""

from __future__ import annotations

import re

from app.models.schemas import AnswerSource, DocumentSupport
from app.vector_db.base import SearchHit

CONVERSATIONAL_PATTERN = re.compile(
    r"^(hi|hello|hey|yo|good (morning|afternoon|evening)|how are you|how'?s it going|"
    r"thanks|thank you|what can you do|can you help me|who are you|what are you)\b",
    re.IGNORECASE,
)

CONVERSATIONAL_SYSTEM = (
    "You are the friendly Holobox teaching assistant on a student kiosk. "
    "Reply naturally and warmly in one or two short sentences. Do not mention documents, "
    "retrieval, RAG or any lack of context. Write only the reply itself."
)


def is_conversational(question: str) -> bool:
    """Obvious greetings and small talk do not need document retrieval."""
    return bool(CONVERSATIONAL_PATTERN.match(question.strip()))


def build_conversational_prompt(question: str) -> str:
    return f"{CONVERSATIONAL_SYSTEM}\n\nQuestion: {question}\n\nAnswer:"


SYSTEM_INSTRUCTION = (
    "You are a helpful teaching assistant for a student kiosk.\n"
    "Answer using the course excerpts only when they actually contain the information. "
    "If they are missing or irrelevant, answer from your own general knowledge; never refuse "
    "just because no excerpt was found. If both sources are needed, combine them and say which "
    "parts came from the uploaded material.\n"
    "Put the marker [n] immediately after a sentence that uses excerpt [n]. Never invent a "
    "marker and never cite general knowledge as an excerpt.\n"
    "If neither source is reliable, say so honestly. Be concise and natural. Do not mention "
    "RAG, embeddings or vector search.\n"
    "Start your reply with a single line in this exact shape: META:documents;full\n"
    "Replace the two words after META: with your own assessment: source is one word — "
    "documents, general_knowledge, mixed or unknown — and support is one word — full, partial, "
    "none or uncertain. Print nothing else on that line. Then write the answer."
)

META_PATTERN = re.compile(r"^\s*META:\s*([a-z_]+)\s*;\s*([a-z_]+)\s*$", re.IGNORECASE | re.MULTILINE)
SOURCE_PATTERN = re.compile(
    r"^\s*source:\s*(documents|general_knowledge|mixed|unknown)\s*$", re.IGNORECASE | re.MULTILINE
)
SUPPORT_PATTERN = re.compile(
    r"^\s*support:\s*(full|partial|none|uncertain)\s*$", re.IGNORECASE | re.MULTILINE
)
META_LOOSE_PATTERN = re.compile(r"^\s*META:\s*([^;\n]+)\s*;\s*([^\n]*)$", re.IGNORECASE | re.MULTILINE)
METADATA_LINE_PATTERN = re.compile(r"^\s*(?:META:|source:|support:)[^\n]*$", re.IGNORECASE | re.MULTILINE)
CITATION_PATTERN = re.compile(r"\[(\d+)\]")


def build_context(hits: list[SearchHit]) -> str:
    lines = []
    for number, hit in enumerate(hits, start=1):
        location = f", page {hit.page_number}" if hit.page_number is not None else ""
        lines.append(f"[{number}] {hit.document_name}{location}: {hit.text}")
    return "\n\n".join(lines)


def build_prompt(question: str, hits: list[SearchHit], course_label: str | None = None) -> str:
    course = f"Course: {course_label}\n" if course_label else ""
    if hits:
        context = (
            "Course excerpts (use only those that actually support your claim):\n"
            f"{build_context(hits)}\n\n"
            "If these excerpts do not contain the answer, answer from general knowledge "
            "without citing them.\n\n"
        )
    else:
        context = (
            "No course excerpts were retrieved. Answer from your general knowledge; "
            "do not invent a document citation.\n\n"
        )
    if hits:
        reminder = (
            "REMINDER: Every factual sentence taken from an excerpt MUST end with that excerpt's "
            "number in square brackets, like this: CUDA was created by NVIDIA [1]. Never cite an "
            "excerpt you did not use. The META support word must be one of: full, partial, none, "
            "uncertain.\n\n"
        )
    else:
        reminder = (
            "REMINDER: No excerpts were provided. Do not use any [n] marker. The META support "
            "word must be none or uncertain.\n\n"
        )
    return f"{SYSTEM_INSTRUCTION}\n\n{course}{context}{reminder}Question: {question}\n\nAnswer:"


def parse_answer(text: str) -> tuple[str, str | None, str | None]:
    """Strip machine metadata from the answer and return validated tags."""
    source_value: str | None = None
    support_value: str | None = None
    stray_answer: str | None = None
    meta = META_PATTERN.search(text)
    loose = META_LOOSE_PATTERN.search(text)
    if loose:
        candidate_source = loose.group(1).strip().lower()
        if candidate_source in {item.value for item in AnswerSource}:
            source_value = candidate_source
        tail = loose.group(2).strip()
        if tail.lower() not in {item.value for item in DocumentSupport}:
            stray_answer = tail
    if meta:
        candidate_source = meta.group(1).lower()
        candidate_support = meta.group(2).lower()
        if candidate_source in {item.value for item in AnswerSource}:
            source_value = candidate_source
        if candidate_support in {item.value for item in DocumentSupport}:
            support_value = candidate_support
    else:
        legacy_source = SOURCE_PATTERN.search(text)
        legacy_support = SUPPORT_PATTERN.search(text)
        if legacy_source:
            source_value = legacy_source.group(1).lower()
        if legacy_support:
            support_value = legacy_support.group(1).lower()
    # Always remove metadata lines, including malformed ones echoed by a model.
    clean = METADATA_LINE_PATTERN.sub("", text).strip()
    if not clean and stray_answer:
        clean = stray_answer
    return clean, source_value, support_value


def cited_numbers(answer: str) -> list[int]:
    """Excerpt numbers the generated answer actually cites."""
    return sorted({int(number) for number in CITATION_PATTERN.findall(answer)})
