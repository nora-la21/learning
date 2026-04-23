from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from database import get_db
from models import WordListResponse, WordResponse, WordUpdate, SetLearnedRequest, ResetProgressRequest

router = APIRouter(prefix="/api", tags=["words"])


@router.get("/lists", response_model=list[WordListResponse])
def get_lists(builtin: Optional[bool] = Query(None)):
    conn = get_db()
    if builtin is True:
        where = "WHERE wl.builtin = 1"
    elif builtin is False:
        where = "WHERE wl.builtin = 0"
    else:
        where = ""
    rows = conn.execute(f"""
        SELECT wl.*,
          COUNT(DISTINCT w.id) as word_count,
          (SELECT COUNT(DISTINCT wp.word_id)
           FROM word_progress wp
           JOIN words ww ON ww.id = wp.word_id
           WHERE ww.list_id = wl.id AND ww.manually_excluded = 0) as seen_count,
          (SELECT COUNT(DISTINCT ww2.id)
           FROM words ww2
           WHERE ww2.list_id = wl.id AND ww2.manually_excluded = 0
           AND (SELECT COALESCE(SUM(wp2.mastered), 0)
                FROM word_progress wp2 WHERE wp2.word_id = ww2.id) >= 4) as mastered_count
        FROM word_lists wl
        LEFT JOIN words w ON w.list_id = wl.id
        {where}
        GROUP BY wl.id
        ORDER BY wl.builtin DESC, wl.created_at DESC
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
    words = conn.execute("""
        SELECT w.*, w.manually_excluded as learned
        FROM words w
        WHERE w.list_id = ?
        ORDER BY w.source_word
    """, (list_id,)).fetchall()
    conn.close()
    return [dict(w) for w in words]


@router.delete("/lists/{list_id}", status_code=204)
def delete_list(list_id: int):
    conn = get_db()
    row = conn.execute("SELECT builtin FROM word_lists WHERE id = ?", (list_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Word list not found")
    if row["builtin"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Cannot delete built-in word lists")
    conn.execute("DELETE FROM word_lists WHERE id = ?", (list_id,))
    conn.commit()
    conn.close()


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


@router.patch("/words/{word_id}/learned", status_code=204)
def set_word_learned(word_id: int, body: SetLearnedRequest):
    conn = get_db()
    word = conn.execute("SELECT id FROM words WHERE id = ?", (word_id,)).fetchone()
    if not word:
        conn.close()
        raise HTTPException(status_code=404, detail="Word not found")
    conn.execute("UPDATE words SET manually_excluded = ? WHERE id = ?", (1 if body.learned else 0, word_id))
    conn.commit()
    conn.close()


@router.post("/words/reset-progress", status_code=204)
def reset_progress(body: ResetProgressRequest):
    if not body.word_ids:
        return
    conn = get_db()
    for wid in body.word_ids:
        conn.execute("DELETE FROM word_progress WHERE word_id = ?", (wid,))
    conn.commit()
    conn.close()
