from datetime import datetime, timezone, timedelta
from database import get_db
from services.scoping import set_known


# Typing the word from memory is the hardest mode, so mastering it is the
# strongest single signal that a word is genuinely known.
TYPING_MODE = "reverse_type_it"


def update_word_progress(
    word_id: int, correct: bool, time_ms: int, mode: str,
    known_on_type_mastery: bool = False, *, user_id: int,
) -> None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM word_progress WHERE word_id = ? AND mode = ? AND user_id = ?",
        (word_id, mode, user_id)
    ).fetchone()

    if row is None:
        conn.execute(
            "INSERT INTO word_progress (word_id, mode, user_id) VALUES (?, ?, ?)",
            (word_id, mode, user_id)
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM word_progress WHERE word_id = ? AND mode = ? AND user_id = ?",
            (word_id, mode, user_id)
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
        WHERE word_id = ? AND mode = ? AND user_id = ?
        """,
        (new_reps, new_ef, new_interval, next_review,
         1 if correct else 0, 0 if correct else 1, now_str, mastered, word_id, mode, user_id),
    )
    conn.execute(
        "INSERT INTO answer_events (word_id, mode, correct, time_ms, user_id) VALUES (?, ?, ?, ?, ?)",
        (word_id, mode, 1 if correct else 0, time_ms, user_id),
    )

    if known_on_type_mastery and mastered and mode == TYPING_MODE:
        set_known(conn, user_id, word_id, True)

    conn.commit()
    conn.close()


def _response_quality(correct: bool, time_ms: int) -> int:
    """A correct answer is a correct answer, however long it took.

    Grading on speed meant anything over five seconds scored 3: correct enough
    to count, but not enough to grow the ease factor, so the interval crept up
    too slowly to ever reach the 21 days mastery needs. Someone who thinks
    carefully could answer correctly forever and never master a word.

    Response time is still recorded on every answer event; it just no longer
    decides the schedule.
    """
    return 5 if correct else 2


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
