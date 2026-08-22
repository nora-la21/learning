"""Irregular-verb drills.

A separate section from vocabulary, because the unit of study is different: a
strong verb is not a word with a translation but a set of principal parts, and
each part has to be recalled on its own. The modes mirror the columns of a
conjugation table.

Progress is tracked per (verb, mode) with the same SM-2 schedule the vocabulary
uses, so a verb whose participle you know but whose plural past you do not will
keep asking for the plural past.
"""
import random
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from routers.auth import current_user
from services.progress_engine import _response_quality, _sm2

router = APIRouter(prefix="/api/verbs", tags=["verbs"])

# Which column of the table the question asks for.
MODES = {
    "past_singular": "Past — singular",
    "past_plural": "Past — plural",
    "participle": "Past participle",
    "auxiliary": "Auxiliary verb",
    "meaning": "Meaning",
}
FULL_CYCLE = ["past_singular", "past_plural", "participle", "auxiliary"]

AUXILIARY_OPTIONS = ["hebben", "zijn", "hebben/zijn"]

_sessions: dict = {}
SESSION_LIMIT = 500


class StartRequest(BaseModel):
    mode: str
    session_size: int = 10


class AnswerRequest(BaseModel):
    session_id: str
    verb_id: int
    mode: str
    answer: str
    time_ms: int = 0


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# Both spellings, because Vercel's /api/:path* rewrite drops the trailing slash
# on the way to the backend: FastAPI would answer /api/verbs with a 307 to
# /api/verbs/ on the backend's own host, which the browser then hits
# cross-origin. Answering both avoids the redirect entirely.
@router.get("")
@router.get("/")
def list_verbs(user=Depends(current_user)):
    """The whole table, with this account's mastery per mode."""
    uid = user["id"]
    conn = get_db()
    try:
        verbs = conn.execute(
            "SELECT id, infinitive, past_singular, past_plural, participle, "
            "auxiliary, meaning FROM irregular_verbs ORDER BY infinitive"
        ).fetchall()
        progress = conn.execute(
            "SELECT verb_id, mode, mastered, repetitions FROM verb_progress "
            "WHERE user_id = ?", (uid,)
        ).fetchall()
    finally:
        conn.close()

    by_verb: dict[int, dict] = {}
    for row in progress:
        by_verb.setdefault(row["verb_id"], {})[row["mode"]] = {
            "mastered": bool(row["mastered"]), "repetitions": row["repetitions"],
        }
    return [
        {**dict(v), "progress": by_verb.get(v["id"], {})}
        for v in verbs
    ]


@router.get("/summary")
def summary(user=Depends(current_user)):
    uid = user["id"]
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) AS n FROM irregular_verbs").fetchone()["n"]
        rows = conn.execute(
            "SELECT mode, COUNT(*) AS practised, "
            "SUM(CASE WHEN mastered = 1 THEN 1 ELSE 0 END) AS mastered "
            "FROM verb_progress WHERE user_id = ? GROUP BY mode", (uid,)
        ).fetchall()
        due = conn.execute(
            "SELECT COUNT(*) AS n FROM verb_progress "
            "WHERE user_id = ? AND next_review_at <= datetime('now')", (uid,)
        ).fetchone()["n"]
    finally:
        conn.close()

    per_mode = {m: {"practised": 0, "mastered": 0} for m in MODES}
    for row in rows:
        if row["mode"] in per_mode:
            per_mode[row["mode"]] = {
                "practised": row["practised"], "mastered": row["mastered"] or 0}
    return {
        "total_verbs": total,
        "due": due,
        "modes": [
            {"mode": m, "label": MODES[m], **per_mode[m]} for m in MODES
        ],
    }


@router.post("/game/start")
def start(body: StartRequest, user=Depends(current_user)):
    mode = body.mode
    if mode not in MODES and mode != "all_forms":
        raise HTTPException(status_code=400, detail=f"Unknown mode: {mode}")

    uid = user["id"]
    conn = get_db()
    try:
        # Least-practised first, and anything already due comes first of all,
        # so a session works on what is actually weak.
        rows = conn.execute(
            "SELECT v.id, COALESCE(MIN(p.repetitions), 0) AS reps, "
            "       MAX(CASE WHEN p.next_review_at <= datetime('now') THEN 1 ELSE 0 END) AS is_due "
            "FROM irregular_verbs v "
            "LEFT JOIN verb_progress p ON p.verb_id = v.id AND p.user_id = ? "
            "GROUP BY v.id", (uid,)
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        raise HTTPException(status_code=400, detail="No verbs available")

    pool = [r["id"] for r in sorted(
        rows, key=lambda r: (-(r["is_due"] or 0), r["reps"], random.random()))]
    size = max(1, min(body.session_size, len(pool)))
    chosen = pool[:size]
    random.shuffle(chosen)

    modes = FULL_CYCLE if mode == "all_forms" else [mode]
    queue = [(verb_id, m) for verb_id in chosen for m in modes]
    if mode == "all_forms":
        # Keep each verb's forms together: recalling them as a set is the point.
        pass
    else:
        random.shuffle(queue)

    session_id = str(uuid.uuid4())
    if len(_sessions) > SESSION_LIMIT:
        _sessions.clear()
    _sessions[session_id] = {
        "user_id": uid, "queue": queue, "index": 0,
        "total": len(queue), "correct": 0, "streak": 0,
    }
    return {"session_id": session_id, "total": len(queue),
            "modes": modes, "verb_count": len(chosen)}


def _load(session_id: str, uid: int):
    session = _sessions.get(session_id)
    if not session or session["user_id"] != uid:
        return None
    return session


@router.get("/game/next")
def next_question(session_id: str, user=Depends(current_user)):
    session = _load(session_id, user["id"])
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["index"] >= len(session["queue"]):
        raise HTTPException(status_code=404, detail="Session complete")

    verb_id, mode = session["queue"][session["index"]]
    conn = get_db()
    try:
        verb = conn.execute(
            "SELECT * FROM irregular_verbs WHERE id = ?", (verb_id,)).fetchone()
    finally:
        conn.close()
    if not verb:
        raise HTTPException(status_code=404, detail="Verb not found")

    # The auxiliary is a three-way choice, so offer buttons rather than a
    # text field: typing "hebben" tests spelling, not the grammar point.
    options = AUXILIARY_OPTIONS if mode == "auxiliary" else None
    return {
        "verb_id": verb_id,
        "mode": mode,
        "mode_label": MODES[mode],
        "infinitive": verb["infinitive"],
        "meaning": verb["meaning"],
        "options": options,
        "progress_index": session["index"],
        "total": session["total"],
        "streak": session["streak"],
    }


@router.post("/game/answer")
def answer(body: AnswerRequest, user=Depends(current_user)):
    uid = user["id"]
    session = _load(body.session_id, uid)
    if session is None:
        raise HTTPException(status_code=400, detail="Session not found")

    conn = get_db()
    try:
        verb = conn.execute(
            "SELECT * FROM irregular_verbs WHERE id = ?", (body.verb_id,)).fetchone()
        if not verb:
            raise HTTPException(status_code=404, detail="Verb not found")

        expected = verb[body.mode] if body.mode in MODES else None
        if expected is None:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {body.mode}")

        given = body.answer.strip().lower()
        target = str(expected).strip().lower()
        # "hebben/zijn" is also written "hebben, zijn"; accept either shape.
        correct = given == target or (
            body.mode == "auxiliary"
            and {p.strip() for p in given.replace(",", "/").split("/") if p.strip()}
            == {p.strip() for p in target.replace(",", "/").split("/") if p.strip()}
        )

        _record(conn, uid, body.verb_id, body.mode, correct, body.time_ms)
        conn.commit()
    finally:
        conn.close()

    session["index"] += 1
    if correct:
        session["correct"] += 1
        session["streak"] += 1
    else:
        session["streak"] = 0

    return {
        "correct": correct,
        "expected": expected,
        "streak": session["streak"],
        "progress_index": session["index"],
        "total": session["total"],
        "session_complete": session["index"] >= session["total"],
        # The whole row, so a wrong answer teaches the pattern rather than
        # just the missing cell.
        "verb": {
            "infinitive": verb["infinitive"],
            "past_singular": verb["past_singular"],
            "past_plural": verb["past_plural"],
            "participle": verb["participle"],
            "auxiliary": verb["auxiliary"],
            "meaning": verb["meaning"],
        },
    }


def _record(conn, uid: int, verb_id: int, mode: str, correct: bool, time_ms: int) -> None:
    row = conn.execute(
        "SELECT * FROM verb_progress WHERE user_id = ? AND verb_id = ? AND mode = ?",
        (uid, verb_id, mode)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO verb_progress (user_id, verb_id, mode) VALUES (?, ?, ?)",
            (uid, verb_id, mode))
        conn.commit()
        row = conn.execute(
            "SELECT * FROM verb_progress WHERE user_id = ? AND verb_id = ? AND mode = ?",
            (uid, verb_id, mode)).fetchone()

    reps, ease, interval = row["repetitions"], row["ease_factor"], row["interval_days"]
    quality = _response_quality(correct, time_ms)
    reps, ease, interval = _sm2(reps, ease, interval, correct, quality)
    mastered = 1 if (reps >= 5 and ease >= 2.0 and interval >= 21) else 0
    next_review = (datetime.now(timezone.utc) + timedelta(days=interval)).strftime(
        "%Y-%m-%d %H:%M:%S")

    conn.execute(
        "UPDATE verb_progress SET repetitions = ?, ease_factor = ?, interval_days = ?, "
        "next_review_at = ?, correct_count = correct_count + ?, "
        "incorrect_count = incorrect_count + ?, last_seen_at = ?, mastered = ? "
        "WHERE user_id = ? AND verb_id = ? AND mode = ?",
        (reps, ease, interval, next_review, 1 if correct else 0,
         0 if correct else 1, _now(), mastered, uid, verb_id, mode))


@router.post("/reset", status_code=204)
def reset(user=Depends(current_user)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM verb_progress WHERE user_id = ?", (user["id"],))
        conn.commit()
    finally:
        conn.close()
