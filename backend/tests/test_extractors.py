import pytest

from app.ingestion.extractors import extract, normalize_text
from tests.helpers import make_docx, make_pdf


def test_pdf_extraction_keeps_page_numbers():
    document = extract("notes.pdf", make_pdf(["First page about clouds.", "Second page about trees."]))
    assert [number for number, _ in document.pages] == [1, 2]
    assert "clouds" in document.pages[0][1]
    assert "trees" in document.pages[1][1]


def test_docx_extraction():
    document = extract("report.docx", make_docx(["Quarterly summary", "Revenue increased."]))
    assert "Quarterly summary" in document.text
    assert "Revenue increased." in document.text
    assert document.pages[0][0] is None


def test_text_and_markdown_extraction():
    assert extract("a.txt", b"hello\r\nworld").text == "hello\nworld"
    assert "# Title" in extract("a.md", b"# Title\n\nBody").text


def test_unsupported_file_type():
    with pytest.raises(ValueError, match="Unsupported"):
        extract("image.png", b"data")


def test_normalize_text_collapses_excess_whitespace():
    assert normalize_text("a  b\r\n\r\n\r\nc") == "a b\n\nc"


def test_letter_spaced_heading_is_restored():
    assert normalize_text("D E E K S H A  A R A L E L I") == "DEEKSHA ARALELI"


def test_letter_spaced_sentence_is_restored():
    raw = "H e l l o  W o r l d .  T h i s  i s  a  t e s t ."
    assert normalize_text(raw) == "Hello World. This is a test."


def test_mixed_normal_and_letter_spaced_lines():
    raw = "Normal paragraph stays as is.\nA n o t h e r  l i n e  h e r e ."
    assert normalize_text(raw) == "Normal paragraph stays as is.\nAnother line here."


def test_already_normal_text_is_unchanged():
    normal = "Quarterly revenue increased 12%.\nSecond line with punctuation: yes!"
    assert normalize_text(normal) == normal


def test_punctuation_and_numeric_values_in_letter_spaced_text():
    raw = "1 s t  p l a c e :  V a l u e  3 7 . 6  u n i t s ."
    assert normalize_text(raw) == "1st place: Value 37.6 units."


def test_bullets_and_paragraphs_are_preserved():
    raw = "- F i r s t  i t e m\n- S e c o n d  i t e m\n\nN e w  p a r a g r a p h ."
    assert normalize_text(raw) == "- First item\n- Second item\n\nNew paragraph."


def test_empty_and_whitespace_extraction_output():
    assert normalize_text("") == ""
    assert normalize_text("  \n \n ") == ""


def test_normalization_is_idempotent():
    raw = "A b c  D e f  g h i .\nNormal line 1 2 3."
    once = normalize_text(raw)
    assert normalize_text(once) == once


def test_pdf_extraction_normalizes_letter_spacing():
    document = extract("spaced.pdf", make_pdf(["H e l l o  W o r l d ."]))
    assert document.text == "Hello World."
