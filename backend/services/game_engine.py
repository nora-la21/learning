import random
import uuid
from dataclasses import dataclass, field
from typing import Optional
from database import get_db

VALID_MODES = {"multiple_choice", "reverse_mc", "listening", "type_it"}


@dataclass
class GameSession:
    session_id: str
    list_id: int
    mode: str
    word_ids: list[int]
    current_index: int = 0
    streak: int = 0
    xp: int = 0
    source_lang: str = "nl"
    target_lang: str = "en"


_sessions: dict[str, GameSession] = {}


def create_session(list_id: int, mode: str, session_size: int) -> GameSession:
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode: {mode}")

    conn = get_db()
    list_row = conn.execute(
        "SELECT source_lang, target_lang FROM word_lists WHERE id = ?", (list_id,)
    ).fetchone()
    if not list_row:
        conn.close()
        raise ValueError("Word list not found")

    all_words = conn.execute(
        "SELECT w.id, wp.repetitions, wp.next_review_at, wp.mastered "
        "FROM words w "
        "LEFT JOIN word_progress wp ON wp.word_id = w.id "
        "WHERE w.list_id = ?",
        (list_id,),
    ).fetchall()
    conn.close()

    if len(all_words) < 4:
        raise ValueError("Need at least 4 words to start a session")

    now_str = _now_str()
    weighted: list[tuple[int, float]] = []
    for row in all_words:
        if row["repetitions"] is None:
            w = 3.0
        elif row["mastered"]:
            w = 0.1
        elif row["next_review_at"] and row["next_review_at"] <= now_str:
            w = 2.0
        else:
            w = 0.5
        weighted.append((row["id"], w))

    ids = [x[0] for x in weighted]
    weights = [x[1] for x in weighted]
    size = min(session_size, len(ids))
    selected = random.choices(ids, weights=weights, k=size)
    # deduplicate while preserving weighted order
    seen: set[int] = set()
    unique: list[int] = []
    for wid in selected:
        if wid not in seen:
            seen.add(wid)
            unique.append(wid)
    # fill up if deduplication reduced count
    remaining = [i for i in ids if i not in seen]
    random.shuffle(remaining)
    unique.extend(remaining[: size - len(unique)])

    session_id = str(uuid.uuid4())
    session = GameSession(
        session_id=session_id,
        list_id=list_id,
        mode=mode,
        word_ids=unique,
        source_lang=list_row["source_lang"],
        target_lang=list_row["target_lang"],
    )
    _sessions[session_id] = session
    return session


def get_next_question(session_id: str) -> Optional[dict]:
    session = _sessions.get(session_id)
    if not session or session.current_index >= len(session.word_ids):
        return None

    word_id = session.word_ids[session.current_index]
    conn = get_db()
    word = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    if not word:
        conn.close()
        return None

    all_words = conn.execute(
        "SELECT source_word, target_word FROM words WHERE list_id = ? AND id != ?",
        (session.list_id, word_id),
    ).fetchall()
    conn.close()

    mode = session.mode
    question_id = str(uuid.uuid4())

    if mode == "multiple_choice":
        prompt = word["source_word"]
        correct = word["target_word"]
        pool = [r["target_word"] for r in all_words]
        distractors = _generate_distractors(correct, pool)
        options = distractors + [correct]
        random.shuffle(options)
        option_langs = [session.target_lang] * len(options)
        return {
            "question_id": question_id,
            "word_id": word_id,
            "prompt": prompt,
            "options": options,
            "mode": mode,
            "source_lang": session.source_lang,
            "target_lang": session.target_lang,
            "option_langs": option_langs,
        }

    elif mode == "reverse_mc":
        prompt = word["target_word"]
        correct = word["source_word"]
        pool = [r["source_word"] for r in all_words]
        distractors = _generate_distractors(correct, pool)
        options = distractors + [correct]
        random.shuffle(options)
        option_langs = [session.source_lang] * len(options)
        return {
            "question_id": question_id,
            "word_id": word_id,
            "prompt": prompt,
            "options": options,
            "mode": mode,
            "source_lang": session.source_lang,
            "target_lang": session.target_lang,
            "option_langs": option_langs,
        }

    elif mode == "listening":
        # prompt is the source word (for TTS), options are source words
        correct = word["source_word"]
        pool = [r["source_word"] for r in all_words]
        distractors = _generate_distractors(correct, pool)
        options = distractors + [correct]
        random.shuffle(options)
        option_langs = [session.source_lang] * len(options)
        return {
            "question_id": question_id,
            "word_id": word_id,
            "prompt": word["source_word"],  # for TTS only; hidden in UI
            "options": options,
            "mode": mode,
            "source_lang": session.source_lang,
            "target_lang": session.target_lang,
            "option_langs": option_langs,
        }

    else:  # type_it
        return {
            "question_id": question_id,
            "word_id": word_id,
            "prompt": word["source_word"],
            "options": None,
            "mode": mode,
            "source_lang": session.source_lang,
            "target_lang": session.target_lang,
            "option_langs": None,
        }


def submit_answer(session_id: str, word_id: int, chosen: str, time_ms: int) -> dict:
    session = _sessions.get(session_id)
    if not session:
        raise ValueError("Session not found")

    conn = get_db()
    word = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    if not word:
        conn.close()
        raise ValueError("Word not found")

    mode = session.mode
    if mode in ("multiple_choice", "type_it"):
        correct_answer = word["target_word"]
    else:
        correct_answer = word["source_word"]

    correct = _check_answer(chosen, correct_answer, mode)

    if correct:
        session.streak += 1
        xp = 10 + min(session.streak * 2, 20)
    else:
        session.streak = 0
        xp = 0
    session.xp += xp
    session.current_index += 1

    conn.close()
    return {
        "correct": correct,
        "correct_answer": correct_answer,
        "xp_gained": xp,
        "streak": session.streak,
        "progress_index": session.current_index,
        "total": len(session.word_ids),
    }


def _check_answer(chosen: str, correct: str, mode: str) -> bool:
    return chosen.strip().lower() == correct.strip().lower()


def _generate_distractors(correct: str, pool: list[str], n: int = 3) -> list[str]:
    candidates = [w for w in pool if w.lower() != correct.lower()]
    similar = [w for w in candidates if abs(len(w) - len(correct)) <= 2]
    other = [w for w in candidates if w not in similar]
    random.shuffle(similar)
    random.shuffle(other)
    merged = similar + other
    return merged[:n]


def _now_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
