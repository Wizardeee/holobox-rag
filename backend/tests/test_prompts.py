from app.rag.prompts import (
    build_prompt,
    build_conversational_prompt,
    cited_numbers,
    format_history,
    is_conversational,
    language_instruction,
    parse_answer,
)
from app.vector_db.base import SearchHit


def test_prompt_asks_for_hybrid_answers_and_citations():
    hits = [SearchHit("c1", "d1", "notes.pdf", 2, "CUDA is a parallel platform.", 0.9)]
    prompt = build_prompt("What is CUDA?", hits, "GPU Architecture")
    assert "Course: GPU Architecture" in prompt
    assert "general knowledge" in prompt
    assert "[1] notes.pdf" in prompt
    assert "META:documents;full" in prompt


def test_no_hits_prompt_does_not_ask_for_a_refusal():
    prompt = build_prompt("What is the capital of France?", [])
    assert "No course excerpts were retrieved" in prompt
    assert "do not invent a document citation" in prompt


def test_parse_answer_strips_echoed_metadata_lines():
    text = (
        "META:general_knowledge;none\n"
        "The capital of France is Paris.\n"
        "source: documents | general_knowledge | mixed | unknown\n"
    )
    answer, source, support = parse_answer(text)
    assert answer == "The capital of France is Paris."
    assert source == "general_knowledge"
    assert support == "none"


def test_malformed_meta_line_does_not_swallow_the_answer():
    answer, source, support = parse_answer("META:general_knowledge;I'm doing well, thanks!")
    assert answer == "I'm doing well, thanks!"
    assert source == "general_knowledge"
    assert support is None


def test_cited_numbers_are_unique_and_sorted():
    assert cited_numbers("Both [2] and [1], repeated [2].") == [1, 2]


def test_conversational_questions_are_detected():
    for question in ("Hi", "Hello", "Hey", "How are you?", "What can you do?", "Can you help me?", "Thank you"):
        assert is_conversational(question), question
    for question in ("What is CUDA?", "Explain GPU architecture.", "What is the capital of France?"):
        assert not is_conversational(question), question


def test_conversational_prompt_needs_no_documents():
    prompt = build_conversational_prompt("Hi")
    assert "Question: Hi" in prompt
    assert "Write only the reply itself" in prompt
    assert "META:" not in prompt
    assert "excerpts" not in prompt.lower()


def test_language_policy_is_explicit_and_ignores_detected_language():
    instruction = language_instruction("English")
    assert "Reply in English" in instruction
    assert "Detected speech language is not an instruction" in instruction
    assert "explicitly asks" in instruction
    conversational = build_conversational_prompt("Hi", language="English")
    assert "Reply in English" in conversational
    assert "excerpts" not in conversational.lower()


def test_no_think_prefix_and_history_are_included():
    history = [("user", "Hi"), ("assistant", "Hello! How can I help?")]
    conversational = build_conversational_prompt("How are you?", history=history, no_think=True)
    assert conversational.startswith("/no_think ")
    assert "Conversation so far" in conversational
    assert "Hello! How can I help?" in conversational
    grounded = build_prompt(
        "What is CUDA?", [SearchHit("c1", "d1", "notes.pdf", 1, "CUDA text", 0.9)],
        no_think=True, language="Spanish", history=history,
    )
    assert grounded.startswith("/no_think ")
    assert "Reply in Spanish" in grounded
    assert "Conversation so far" in grounded
    assert format_history([]) == ""
