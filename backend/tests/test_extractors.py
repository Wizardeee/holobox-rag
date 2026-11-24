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
