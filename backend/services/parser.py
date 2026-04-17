import csv
import io
from typing import Optional


def parse_uploaded_file(filename: str, content: bytes) -> list[tuple[str, str]]:
    """Returns list of (source_word, target_word) pairs."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        return _parse_pdf(content)
    elif ext in ("docx",):
        return _parse_docx(content)
    else:
        return _parse_csv_or_txt(content)


def _parse_csv_or_txt(content: bytes) -> list[tuple[str, str]]:
    text = content.decode("utf-8", errors="replace")
    pairs: list[tuple[str, str]] = []

    # Try CSV with different delimiters
    for delimiter in [",", "\t", ";", " - ", " = "]:
        try:
            reader = csv.reader(io.StringIO(text), delimiter=delimiter if len(delimiter) == 1 else ",")
            candidate: list[tuple[str, str]] = []
            for row in reader:
                if not row:
                    continue
                if len(delimiter) > 1:
                    # multi-char delimiter: split manually
                    break
                src = row[0].strip()
                tgt = row[1].strip() if len(row) >= 2 else ""
                if src and tgt and not src.startswith("#"):
                    candidate.append((src, tgt))
            if candidate:
                return candidate
        except Exception:
            continue

    # Multi-char delimiters fallback
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        for sep in ["\t", ",", " - ", " = ", ":"]:
            if sep in line:
                parts = line.split(sep, 1)
                src, tgt = parts[0].strip(), parts[1].strip()
                if src and tgt:
                    pairs.append((src, tgt))
                    break

    return pairs


def _parse_pdf(content: bytes) -> list[tuple[str, str]]:
    try:
        import pdfplumber
    except ImportError:
        return []

    pairs: list[tuple[str, str]] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row and len(row) >= 2 and row[0] and row[1]:
                        src = str(row[0]).strip()
                        tgt = str(row[1]).strip()
                        if src and tgt and src.lower() not in ("word", "source", "dutch", "term"):
                            pairs.append((src, tgt))

            if not pairs:
                text = page.extract_text() or ""
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    for sep in ["\t", ",", " - ", " = "]:
                        if sep in line:
                            parts = line.split(sep, 1)
                            src, tgt = parts[0].strip(), parts[1].strip()
                            if src and tgt:
                                pairs.append((src, tgt))
                            break

    return pairs


def _parse_docx(content: bytes) -> list[tuple[str, str]]:
    try:
        from docx import Document
    except ImportError:
        return []

    pairs: list[tuple[str, str]] = []
    doc = Document(io.BytesIO(content))

    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if len(cells) >= 2 and cells[0] and cells[1]:
                src, tgt = cells[0], cells[1]
                if src.lower() not in ("word", "source", "dutch", "term", "translation"):
                    pairs.append((src, tgt))

    if not pairs:
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            for sep in ["\t", ",", " - ", " = "]:
                if sep in text:
                    parts = text.split(sep, 1)
                    src, tgt = parts[0].strip(), parts[1].strip()
                    if src and tgt:
                        pairs.append((src, tgt))
                    break

    return pairs
