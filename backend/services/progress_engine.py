from datetime import datetime, timezone, timedelta
from database import get_db


def update_word_progress(word_id: int, correct: bool, time_ms: int, mode: str) -> None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM word_progress WHERE word_id = ? AND mode = ?", (word_id, mode)
    ).fetchone()

    if row is None:
        conn.execute(
            "INSERT INTO word_progress (word_id, mode) VALUES (?, ?)", (word_id, mode)
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM word_progress WHERE word_id = ? AND mode = ?", (word_id, mode)
        ).fetchone()

    reps = row["repetitions"]
    ef = row["ease_factor"]
    interval = row["interval_days"]

    quality = _response_quality(correct, time_ms)
    new_reps, new_ef, new_interval = _sm2(reps, ef, interval, correct, quality)
    mastered = 1 if (new_reps >= 5 and new_ef >= 2.0 and new_interval >= 21) else 0

    next_review = (datetime.now(timezone.utc) + timedelta(days=new_interval)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    conn.execute(
        """
        UPDATE word_progress SET
            repetitions = ?,
            ease_factor = ?,
            interval_days = ?,
            next_review_at = ?,
            correct_count = correct_count + ?,
            incorrect_count = incorrect_count + ?,
            last_seen_at = ?,
            mastered = ?
        WHERE word_id = ? AND mode = ?
        """,
        (new_reps, new_ef, new_interval, next_review,
         1 if correct else 0, 0 if correct else 1, now_str, mastered, word_id, mode),
    )
    conn.execute(
        "INSERT INTO answer_events (word_id, mode, correct, time_ms) VALUES (?, ?, ?, ?)",
        (word_id, mode, 1 if correct else 0, time_ms),
    )
    conn.commit()
    conn.close()


def _response_quality(correct: bool, time_ms: int) -> int:
    if not correct:
        return 2
    seconds = time_ms / 1000
    if seconds > 5:
        return 3
    elif seconds > 2:
        return 4
    else:
        return 5


def _sm2(reps: int, ef: float, interval: int, correct: bool, quality: int) -> tuple[int, float, int]:
    if not correct or quality < 3:
        new_reps = 0
        new_interval = 1
        new_ef = max(1.3, ef - 0.2)
    else:
        new_reps = reps + 1
        if new_reps == 1:
            new_interval = 1
        elif new_reps == 2:
            new_interval = 6
        else:
            new_interval = min(round(interval * ef), 365)
        new_ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        new_ef = max(1.3, new_ef)
    return new_reps, new_ef, new_interval
