"""Minimal but genuine PDF/DOCX builders for extraction tests."""

from io import BytesIO
import math
import struct
import wave
from zipfile import ZipFile, ZIP_DEFLATED


def make_pdf(pages: list[str]) -> bytes:
    font_number = 3 + 2 * len(pages)
    objects: list[tuple[int, str]] = [(1, "<< /Type /Catalog /Pages 2 0 R >>")]
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(pages)))
    objects.append((2, f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>"))
    for index, text in enumerate(pages):
        page_number = 3 + 2 * index
        content_number = page_number + 1
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET"
        objects.append(
            (
                page_number,
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font_number} 0 R >> >> /Contents {content_number} 0 R >>",
            )
        )
        objects.append((content_number, f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream"))
    objects.append((font_number, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))

    out = BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets: list[int] = []
    for number, body in objects:
        offsets.append(len(out.getvalue()))
        out.write(f"{number} 0 obj\n{body}\nendobj\n".encode())
    xref_position = len(out.getvalue())
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_position}\n%%EOF\n".encode()
    )
    return out.getvalue()


def make_wav(seconds: int = 1) -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(
            b"".join(
                struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / 16000)))
                for i in range(16000 * seconds)
            )
        )
    return buffer.getvalue()


def make_docx(paragraphs: list[str]) -> bytes:
    body = "".join(f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>" for text in paragraphs)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", document)
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/></Types>',
        )
    return buffer.getvalue()
