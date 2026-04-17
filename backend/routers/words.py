from fastapi import APIRouter, HTTPException
from database import get_db
from models import WordListResponse, WordResponse, WordUpdate

router = APIRouter(prefix="/api", tags=["words"])


@router.get("/lists", response_model=list[WordListResponse])
def get_lists():
    conn = get_db()
    rows = conn.execute("""
        SELECT wl.*, COUNT(w.id) as word_count
        FROM word_lists wl
        LEFT JOIN words w ON w.list_id = wl.id
        GROUP BY wl.id
        ORDER BY wl.created_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/lists/{list_id}/words", response_model=list[WordResponse])
def get_words(list_id: int):
    conn = get_db()
    row = conn.execute("SELECT id FROM word_lists WHERE id = ?", (list_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Word list not found")
    words = conn.execute(
        "SELECT * FROM words WHERE list_id = ? ORDER BY source_word", (list_id,)
    ).fetchall()
    conn.close()
    return [dict(w) for w in words]


@router.delete("/lists/{list_id}", status_code=204)
def delete_list(list_id: int):
    conn = get_db()
    result = conn.execute("DELETE FROM word_lists WHERE id = ?", (list_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Word list not found")


@router.patch("/words/{word_id}", response_model=WordResponse)
def update_word(word_id: int, body: WordUpdate):
    conn = get_db()
    word = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    if not word:
        conn.close()
        raise HTTPException(status_code=404, detail="Word not found")
    source = body.source_word if body.source_word is not None else word["source_word"]
    target = body.target_word if body.target_word is not None else word["target_word"]
    conn.execute(
        "UPDATE words SET source_word = ?, target_word = ? WHERE id = ?",
        (source, target, word_id),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    conn.close()
    return dict(updated)


@router.delete("/words/{word_id}", status_code=204)
def delete_word(word_id: int):
    conn = get_db()
    result = conn.execute("DELETE FROM words WHERE id = ?", (word_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Word not found")
