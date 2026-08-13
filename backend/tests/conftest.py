"""Shared fixtures.

The suite runs against whichever backend the environment selects: set
DATABASE_URL to exercise Postgres, leave it unset to use a throwaway SQLite
file. CI runs it both ways, because the two disagree in ways that have caused
real data loss — a failed statement aborts a Postgres transaction but not a
SQLite one.

database.py resolves its configuration at import time, so the environment has
to be settled before it is imported.
"""
import os
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

if not os.environ.get("DATABASE_URL"):
    os.environ.setdefault(
        "DB_PATH", str(Path(tempfile.mkdtemp(prefix="vocab-tests-")) / "test.db")
    )

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import database  # noqa: E402

TABLES = ("game_sessions", "answer_events", "word_progress", "words", "word_lists")


def reset_database() -> None:
    """Drop everything and rebuild, so each module starts from a known state."""
    conn = database.get_db()
    if database.USE_POSTGRES:
        conn.execute(f"DROP TABLE IF EXISTS {', '.join(TABLES)} CASCADE")
    else:
        for table in TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
    conn.commit()
    conn.close()
    database.init_db()
    database.seed_builtin_lists()


@pytest.fixture(scope="module")
def client():
    reset_database()
    import main
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def db():
    conn = database.get_db()
    yield conn
    conn.close()


@pytest.fixture
def custom_list(client):
    """An empty user list, plus a helper to fill it."""
    lid = client.post("/api/lists", params={"name": "Test List"}).json()["id"]

    def add(pairs):
        ids = []
        for source, target in pairs:
            r = client.post("/api/words/quick-add", json={
                "list_id": lid, "source_word": source, "target_word": target})
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        return ids

    return lid, add


def biggest_builtin(client):
    lists = client.get("/api/lists").json()
    return max(lists, key=lambda l: l.get("word_count") or 0)


def play(client, list_id, mode="multiple_choice", size=5, rounds=40, correct=False):
    """Run a session to completion. Returns the number of answers submitted."""
    r = client.post("/api/game/start", json={
        "list_id": list_id, "mode": mode, "session_size": size})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    answered = 0
    for _ in range(rounds):
        q = client.get("/api/game/next", params={"session_id": sid})
        if q.status_code != 200 or not q.json().get("question_id"):
            break
        qj = q.json()
        options = qj.get("options") or ["zzz"]
        chosen = options[0]
        a = client.post("/api/game/answer", json={
            "session_id": sid, "word_id": qj["word_id"],
            "chosen": chosen, "time_ms": 800})
        assert a.status_code == 200, a.text
        answered += 1
        aj = a.json()
        if aj.get("progress_index", 0) >= aj.get("total", 0) and not aj.get("new_mode"):
            break
    return answered
