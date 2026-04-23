from fastapi import APIRouter, HTTPException
from models import ProgressSummary, WordProgressDetail, WordModeProgress, HeatmapEntry
from database import get_db

router = APIRouter(prefix="/api/progress", tags=["progress"])

NUM_MODES = 4


@router.get("/summary", response_model=ProgressSummary)
def get_summary(list_id: int):
    conn = get_db()
    list_row = conn.execute("SELECT id FROM word_lists WHERE id = ?", (list_id,)).fetchone()
    if not list_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Word list not found")

    total = conn.execute("SELECT COUNT(*) FROM words WHERE list_id = ?", (list_id,)).fetchone()[0]

    mastered = conn.execute(
        "SELECT COUNT(DISTINCT w.id) FROM words w WHERE w.list_id = ? "
        "AND (SELECT COUNT(*) FROM word_progress wp WHERE wp.word_id = w.id AND wp.mastered = 1) >= ?",
        (list_id, NUM_MODES),
    ).fetchone()[0]

    in_progress = conn.execute(
        "SELECT COUNT(DISTINCT w.id) FROM words w WHERE w.list_id = ? "
        "AND (SELECT COUNT(*) FROM word_progress wp WHERE wp.word_id = w.id AND wp.repetitions > 0) > 0 "
        "AND (SELECT COUNT(*) FROM word_progress wp WHERE wp.word_id = w.id AND wp.mastered = 1) < ?",
        (list_id, NUM_MODES),
    ).fetchone()[0]

    not_started = total - mastered - in_progress

    due_today = conn.execute(
        "SELECT COUNT(DISTINCT w.id) FROM words w "
        "JOIN word_progress wp ON wp.word_id = w.id "
        "WHERE w.list_id = ? AND wp.next_review_at <= datetime('now')",
        (list_id,),
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
    words = conn.execute(
        "SELECT id as word_id, source_word, target_word FROM words WHERE list_id = ? ORDER BY source_word",
        (list_id,),
    ).fetchall()

    result = []
    for word in words:
        mode_rows = conn.execute(
            "SELECT mode, repetitions, correct_count, incorrect_count, mastered "
            "FROM word_progress WHERE word_id = ? ORDER BY mode",
            (word["word_id"],),
        ).fetchall()
        modes = [
            WordModeProgress(
                mode=r["mode"],
                repetitions=r["repetitions"],
                correct_count=r["correct_count"],
                incorrect_count=r["incorrect_count"],
                mastered=bool(r["mastered"]),
            )
            for r in mode_rows
        ]
        total_correct = sum(m.correct_count for m in modes)
        total_incorrect = sum(m.incorrect_count for m in modes)
        fully_mastered = len([m for m in modes if m.mastered]) >= NUM_MODES
        result.append(WordProgressDetail(
            word_id=word["word_id"],
            source_word=word["source_word"],
            target_word=word["target_word"],
            modes=modes,
            total_correct=total_correct,
            total_incorrect=total_incorrect,
            fully_mastered=fully_mastered,
        ))

    conn.close()
    return result


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
