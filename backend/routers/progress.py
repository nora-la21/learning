from fastapi import APIRouter, Depends, HTTPException
from models import (
    ProgressSummary, WordProgressDetail, WordModeProgress, HeatmapEntry,
    DueSummary, DueListEntry,
)
from database import get_db
from routers.auth import current_user
from services.scoping import known_join, NOT_KNOWN, owns_list

router = APIRouter(prefix="/api/progress", tags=["progress"])

NUM_MODES = 4


@router.get("/summary", response_model=ProgressSummary)
def get_summary(list_id: int, user=Depends(current_user)):
    conn = get_db()
    uid = user["id"]
    if not owns_list(conn, uid, list_id):
        conn.close()
        raise HTTPException(status_code=404, detail="Word list not found")

    total = conn.execute("SELECT COUNT(*) FROM words WHERE list_id = ?", (list_id,)).fetchone()[0]

    mastered = conn.execute(
        f"SELECT COUNT(DISTINCT w.id) FROM words w {known_join()} WHERE w.list_id = ? "
        f"AND (COALESCE(uwf.known, 0) = 1 OR "
        "(SELECT COUNT(*) FROM word_progress wp "
        " WHERE wp.word_id = w.id AND wp.user_id = ? AND wp.mastered = 1) >= ?)",
        (uid, list_id, uid, NUM_MODES),
    ).fetchone()[0]

    in_progress = conn.execute(
        f"SELECT COUNT(DISTINCT w.id) FROM words w {known_join()} WHERE w.list_id = ? "
        f"AND {NOT_KNOWN} "
        "AND (SELECT COUNT(*) FROM word_progress wp "
        "     WHERE wp.word_id = w.id AND wp.user_id = ? AND wp.repetitions > 0) > 0 "
        "AND (SELECT COUNT(*) FROM word_progress wp "
        "     WHERE wp.word_id = w.id AND wp.user_id = ? AND wp.mastered = 1) < ?",
        (uid, list_id, uid, uid, NUM_MODES),
    ).fetchone()[0]

    not_started = total - mastered - in_progress

    due_today = conn.execute(
        "SELECT COUNT(DISTINCT w.id) FROM words w "
        "JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ? "
        "WHERE w.list_id = ? AND wp.next_review_at <= datetime('now')",
        (uid, list_id),
    ).fetchone()[0]

    events_7d = conn.execute(
        "SELECT correct FROM answer_events ae "
        "JOIN words w ON w.id = ae.word_id "
        "WHERE w.list_id = ? AND ae.user_id = ? "
        "AND ae.answered_at >= datetime('now', '-7 days')",
        (list_id, uid),
    ).fetchall()
    accuracy_7d = None
    if events_7d:
        accuracy_7d = round(sum(r["correct"] for r in events_7d) / len(events_7d) * 100, 1)

    daily = conn.execute(
        "SELECT DATE(answered_at) as day FROM answer_events WHERE user_id = ? "
        "GROUP BY day ORDER BY day DESC LIMIT 60", (uid,)
    ).fetchall()
    streak = _compute_streak([r["day"] for r in daily])

    conn.close()
    return ProgressSummary(
        total_words=total,
        mastered=mastered,
        in_progress=in_progress,
        not_started=not_started,
        due_today=due_today,
        accuracy_7d=accuracy_7d,
        current_streak=streak,
    )


@router.get("/words", response_model=list[WordProgressDetail])
def get_word_progress(list_id: int, user=Depends(current_user)):
    conn = get_db()
    uid = user["id"]
    if not owns_list(conn, uid, list_id):
        conn.close()
        raise HTTPException(status_code=404, detail="Word list not found")
    words = conn.execute(
        "SELECT w.id as word_id, w.source_word, w.target_word, "
        "CASE WHEN COALESCE(uwf.known, 0) = 1 THEN 1 ELSE 0 END as learned "
        f"FROM words w {known_join()} WHERE w.list_id = ? ORDER BY w.source_word",
        (uid, list_id),
    ).fetchall()

    # One query for every word's progress rather than one per word: this page used
    # to issue N+1 round trips, which is unnoticeable on a local file and seconds
    # of latency against a hosted database.
    by_word: dict[int, list] = {}
    if words:
        ph = ','.join('?' * len(words))
        for r in conn.execute(
            "SELECT wp.word_id, wp.mode, wp.repetitions, wp.correct_count, "
            "wp.incorrect_count, wp.mastered FROM word_progress wp "
            f"WHERE wp.user_id = ? AND wp.word_id IN ({ph}) ORDER BY wp.word_id, wp.mode",
            (uid, *(w["word_id"] for w in words)),
        ).fetchall():
            by_word.setdefault(r["word_id"], []).append(r)

    result = []
    for word in words:
        modes = [
            WordModeProgress(
                mode=r["mode"],
                repetitions=r["repetitions"],
                correct_count=r["correct_count"],
                incorrect_count=r["incorrect_count"],
                mastered=bool(r["mastered"]),
            )
            for r in by_word.get(word["word_id"], [])
        ]
        total_correct = sum(m.correct_count for m in modes)
        total_incorrect = sum(m.incorrect_count for m in modes)
        fully_mastered = bool(word["learned"]) or len([m for m in modes if m.mastered]) >= NUM_MODES
        result.append(WordProgressDetail(
            word_id=word["word_id"],
            source_word=word["source_word"],
            target_word=word["target_word"],
            modes=modes,
            total_correct=total_correct,
            total_incorrect=total_incorrect,
            fully_mastered=fully_mastered,
            learned=bool(word["learned"]),
        ))

    conn.close()
    return result


@router.get("/due", response_model=DueSummary)
def get_due(limit: int = 200, user=Depends(current_user)):
    """Words the spaced-repetition schedule says are ready to review.

    A word counts as due when any single mode has come up for review; the
    ordering is by how overdue it is, so truncating to `limit` keeps the most
    urgent words rather than an arbitrary slice.
    """
    conn = get_db()
    uid = user["id"]
    rows = conn.execute(
        "SELECT w.id, w.list_id, MIN(wp.next_review_at) AS due_at "
        "FROM words w "
        "JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ? "
        "JOIN word_lists wl ON wl.id = w.list_id "
        f"{known_join()} "
        f"WHERE {NOT_KNOWN} AND (wl.builtin = 1 OR wl.user_id = ?) "
        "AND wp.next_review_at <= datetime('now') "
        "GROUP BY w.id, w.list_id "
        "ORDER BY due_at ASC",
        (uid, uid, uid),
    ).fetchall()

    counts: dict[int, int] = {}
    for r in rows:
        counts[r["list_id"]] = counts.get(r["list_id"], 0) + 1

    by_list: list[DueListEntry] = []
    if counts:
        ph = ','.join('?' * len(counts))
        names = {
            n["id"]: n["name"]
            for n in conn.execute(
                f"SELECT id, name FROM word_lists WHERE id IN ({ph})", tuple(counts)
            ).fetchall()
        }
        by_list = [
            DueListEntry(list_id=lid, name=names.get(lid, "?"), count=cnt)
            for lid, cnt in sorted(counts.items(), key=lambda kv: -kv[1])
        ]
    conn.close()

    word_ids = [r["id"] for r in rows[:limit]]
    return DueSummary(
        total=len(rows),
        word_ids=word_ids,
        primary_list_id=rows[0]["list_id"] if rows else None,
        by_list=by_list,
    )


@router.get("/heatmap", response_model=list[HeatmapEntry])
def get_heatmap(user=Depends(current_user)):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT DATE(answered_at) as date, COUNT(*) as count
        FROM answer_events
        WHERE user_id = ? AND answered_at >= datetime('now', '-365 days')
        GROUP BY date
        ORDER BY date
        """, (user["id"],)
    ).fetchall()
    conn.close()
    return [{"date": r["date"], "count": r["count"]} for r in rows]


def _compute_streak(days: list[str]) -> int:
    from datetime import date, timedelta
    if not days:
        return 0
    today = date.today()
    streak = 0
    expected = today
    for day_str in days:
        d = date.fromisoformat(day_str)
        if d == expected or d == expected - timedelta(days=1):
            streak += 1
            expected = d - timedelta(days=1)
        else:
            break
    return streak
