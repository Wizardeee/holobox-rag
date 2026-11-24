"""Grounded prompt template. The model must not invent facts."""

from app.vector_db.base import SearchHit

SYSTEM_INSTRUCTION = (
    "You answer questions using ONLY the numbered context excerpts from uploaded documents. "
    "If the excerpts do not contain the answer, say exactly: "
    "\"I don't have enough information in the uploaded documents to answer that question.\" "
    "Never use outside knowledge. Cite the excerpt numbers you used in your answer."
)


def build_context(hits: list[SearchHit]) -> str:
    lines = []
    for number, hit in enumerate(hits, start=1):
        location = f", page {hit.page_number}" if hit.page_number is not None else ""
        lines.append(f"[{number}] {hit.document_name}{location}: {hit.text}")
    return "\n\n".join(lines)


def build_prompt(question: str, hits: list[SearchHit]) -> str:
    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"Context excerpts:\n{build_context(hits)}\n\n"
        f"Question: {question}\n\n"
        "Answer:"
    )
