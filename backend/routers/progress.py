from fastapi import APIRouter, HTTPException
from models import ProgressSummary, WordProgressDetail, HeatmapEntry
from database import get_db

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummary)
def get_summary(list_id: int):
    conn = get_db()
    list_row = conn.execute("SELECT id FROM word_lists WHERE id = ?", (list_id,)).fetchone()
    if not list_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Word list not found")

    total = conn.execute("SELECT COUNT(*) FROM words WHERE list_id = ?", (list_id,)).fetchone()[0]
    mastered = conn.execute(
        "SELECT COUNT(*) FROM words w JOIN word_progress wp ON wp.word_id = w.id "
        "WHERE w.list_id = ? AND wp.mastered = 1", (list_id,)
    ).fetchone()[0]
    in_progress = conn.execute(
        "SELECT COUNT(*) FROM words w JOIN word_progress wp ON wp.word_id = w.id "
        "WHERE w.list_id = ? AND wp.mastered = 0 AND wp.repetitions > 0", (list_id,)
    ).fetchone()[0]
    not_started = total - mastered - in_progress
    due_today = conn.execute(
        "SELECT COUNT(*) FROM words w JOIN word_progress wp ON wp.word_id = w.id "
        "WHERE w.list_id = ? AND wp.next_review_at <= datetime('now')", (list_id,)
    ).fetchone()[0]

    events_7d = conn.execute(
        "SELECT correct FROM answer_events ae "
        "JOIN words w ON w.id = ae.word_id "
        "WHERE w.list_id = ? AND ae.answered_at >= datetime('now', '-7 days')",
        (list_id,),
    ).fetchall()
    accuracy_7d = None
    if events_7d:
        accuracy_7d = round(sum(r["correct"] for r in events_7d) / len(events_7d) * 100, 1)

    # streak: consecutive days with at least one answer event (any list)
    daily = conn.execute(
        "SELECT DATE(answered_at) as day FROM answer_events "
        "GROUP BY day ORDER BY day DESC LIMIT 60"
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
def get_word_progress(list_id: int):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT w.id as word_id, w.source_word, w.target_word,
               COALESCE(wp.repetitions, 0) as repetitions,
               COALESCE(wp.ease_factor, 2.5) as ease_factor,
               COALESCE(wp.interval_days, 1) as interval_days,
               COALESCE(wp.next_review_at, datetime('now')) as next_review_at,
               COALESCE(wp.mastered, 0) as mastered,
               COALESCE(wp.correct_count, 0) as correct_count,
               COALESCE(wp.incorrect_count, 0) as incorrect_count
        FROM words w
        LEFT JOIN word_progress wp ON wp.word_id = w.id
        WHERE w.list_id = ?
        ORDER BY w.source_word
        """,
        (list_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/heatmap", response_model=list[HeatmapEntry])
def get_heatmap():
    conn = get_db()
    rows = conn.execute(
        """
        SELECT DATE(answered_at) as date, COUNT(*) as count
        FROM answer_events
        WHERE answered_at >= datetime('now', '-365 days')
        GROUP BY date
        ORDER BY date
        """
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
