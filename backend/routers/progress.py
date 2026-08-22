from fastapi import APIRouter, Depends, HTTPException
from models import (
    ProgressSummary, WordProgressDetail, WordModeProgress, HeatmapEntry,
    DueSummary, DueListEntry, MasteredWord, MasteredWords,
)
from database import get_db
from routers.auth import current_user
from services.scoping import known_join, IS_KNOWN, NOT_KNOWN, owns_list

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


@router.get("/mastered", response_model=MasteredWords)
def get_mastered(user=Depends(current_user)):
    """Every word this account has mastered, across all the lists it can see.

    The mastery test has to be the one the list counts use — flagged known, or
    mastered in all four modes — or the number on the tile and the words behind
    it would disagree, which is worse than not offering the drill-down at all.
    """
    conn = get_db()
    uid = user["id"]
    try:
        rows = conn.execute(
            "SELECT w.id AS word_id, w.source_word, w.target_word, "
            "       w.list_id, wl.name AS list_name, "
            f"       CASE WHEN {IS_KNOWN} THEN 1 ELSE 0 END AS marked_known, "
            "       COALESCE(SUM(wp.mastered), 0) AS mastered_modes, "
            "       COALESCE(SUM(wp.correct_count), 0) AS total_correct, "
            "       COALESCE(SUM(wp.incorrect_count), 0) AS total_incorrect, "
            "       MAX(wp.last_seen_at) AS last_seen_at "
            "FROM words w "
            "JOIN word_lists wl ON wl.id = w.list_id "
            f"{known_join()} "
            "LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ? "
            "WHERE (wl.builtin = 1 OR wl.user_id = ?) "
            "GROUP BY w.id, w.source_word, w.target_word, w.list_id, wl.name, uwf.known "
            f"HAVING {IS_KNOWN} OR COALESCE(SUM(wp.mastered), 0) >= ? "
            "ORDER BY wl.name ASC, w.source_word ASC",
            (uid, uid, uid, NUM_MODES),
        ).fetchall()
    finally:
        conn.close()

    words = [
        MasteredWord(
            word_id=r["word_id"],
            source_word=r["source_word"],
            target_word=r["target_word"],
            list_id=r["list_id"],
            list_name=r["list_name"],
            marked_known=bool(r["marked_known"]),
            mastered_modes=int(r["mastered_modes"] or 0),
            total_correct=int(r["total_correct"] or 0),
            total_incorrect=int(r["total_incorrect"] or 0),
            last_seen_at=r["last_seen_at"],
        )
        for r in rows
    ]
    return MasteredWords(total=len(words), words=words)


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


@router.post("/reset-all", status_code=204)
def reset_all_progress(user=Depends(current_user)):
    """Wipe this account's learning history, keeping its word lists.

    Needed because the first account inherits whatever was practised before
    accounts existed, which is right for an upgrade and wrong for someone who
    wanted to start fresh.
    """
    uid = user["id"]
    conn = get_db()
    try:
        for table in ("word_progress", "answer_events", "user_word_flags", "game_sessions"):
            conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (uid,))
        conn.commit()
    finally:
        conn.close()


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
