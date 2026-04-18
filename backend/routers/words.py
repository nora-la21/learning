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
        SELECT wl.*, COUNT(w.id) as word_count
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
        SELECT w.*, COALESCE(wp.manually_excluded, 0) as learned
        FROM words w
        LEFT JOIN word_progress wp ON wp.word_id = w.id
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
    conn.execute("""
        INSERT INTO word_progress (word_id, manually_excluded)
        VALUES (?, ?)
        ON CONFLICT(word_id) DO UPDATE SET manually_excluded = excluded.manually_excluded
    """, (word_id, 1 if body.learned else 0))
    conn.commit()
    conn.close()


@router.post("/words/reset-progress", status_code=204)
def reset_progress(body: ResetProgressRequest):
    if not body.word_ids:
        return
    conn = get_db()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    for wid in body.word_ids:
        conn.execute("""
            INSERT INTO word_progress
                (word_id, repetitions, ease_factor, interval_days, next_review_at,
                 correct_count, incorrect_count, mastered, manually_excluded)
            VALUES (?, 0, 2.5, 1, ?, 0, 0, 0, 0)
            ON CONFLICT(word_id) DO UPDATE SET
                repetitions=0, ease_factor=2.5, interval_days=1,
                next_review_at=excluded.next_review_at,
                correct_count=0, incorrect_count=0, mastered=0, manually_excluded=0
        """, (wid, now))
    conn.commit()
    conn.close()
