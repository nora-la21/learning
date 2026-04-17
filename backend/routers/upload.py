from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from database import get_db
from models import UploadPreview, WordPair, UploadConfirm, UploadConfirmResponse
from services.parser import parse_uploaded_file

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload", response_model=UploadPreview)
async def upload_preview(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or "upload"
    pairs = parse_uploaded_file(filename, content)
    if not pairs:
        raise HTTPException(
            status_code=422,
            detail="Could not parse any word pairs from the file. "
                   "Expected format: two columns (source word, translation) separated by comma, tab, or in a table.",
        )
    return UploadPreview(
        filename=filename,
        words=[WordPair(source_word=s, target_word=t) for s, t in pairs],
        word_count=len(pairs),
    )


@router.post("/upload/confirm", response_model=UploadConfirmResponse)
def upload_confirm(body: UploadConfirm):
    if not body.words:
        raise HTTPException(status_code=422, detail="No words provided")

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO word_lists (name, source_lang, target_lang, source_file) VALUES (?, ?, ?, ?)",
        (body.list_name, body.source_lang, body.target_lang, body.source_file),
    )
    list_id = cursor.lastrowid
    inserted = 0
    for w in body.words:
        try:
            conn.execute(
                "INSERT INTO words (list_id, source_word, target_word) VALUES (?, ?, ?)",
                (list_id, w.source_word.strip(), w.target_word.strip()),
            )
            inserted += 1
        except Exception:
            pass  # skip duplicates
    conn.commit()
    conn.close()
    return UploadConfirmResponse(list_id=list_id, word_count=inserted)
