"""Sessions must outlive the process.

They used to exist only in a module-level dict, so a deploy or a free-tier host
waking from sleep dropped every session in progress. Mid-practice that showed up
as "Session not found", or as the finish screen appearing over a session the
user had not finished.
"""
import database
from services import game_engine
from conftest import biggest_builtin


def simulate_restart():
    """Everything a fresh process would lose."""
    game_engine._sessions.clear()


def test_session_row_is_written(client, db):
    lid = biggest_builtin(client)["id"]
    r = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5})
    sid = r.json()["session_id"]
    row = db.execute(
        "SELECT session_id FROM game_sessions WHERE session_id = ?", (sid,)).fetchone()
    assert row is not None


def test_practice_continues_after_a_restart(client):
    lid = biggest_builtin(client)["id"]
    sid = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]

    q = client.get("/api/game/next", params={"session_id": sid}).json()
    client.post("/api/game/answer", json={
        "session_id": sid, "word_id": q["word_id"],
        "chosen": (q.get("options") or ["zzz"])[0], "time_ms": 700})

    simulate_restart()

    nxt = client.get("/api/game/next", params={"session_id": sid})
    assert nxt.status_code == 200, "the session vanished across a restart"
    assert nxt.json().get("question_id")


def test_progress_is_not_rewound_by_a_restart(client):
    lid = biggest_builtin(client)["id"]
    sid = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]

    last = 0
    for _ in range(3):
        q = client.get("/api/game/next", params={"session_id": sid}).json()
        a = client.post("/api/game/answer", json={
            "session_id": sid, "word_id": q["word_id"],
            "chosen": (q.get("options") or ["zzz"])[0], "time_ms": 700})
        last = a.json()["progress_index"]

    simulate_restart()

    q = client.get("/api/game/next", params={"session_id": sid}).json()
    a = client.post("/api/game/answer", json={
        "session_id": sid, "word_id": q["word_id"],
        "chosen": (q.get("options") or ["zzz"])[0], "time_ms": 700})
    assert a.json()["progress_index"] >= last, "progress went backwards after a restart"


def test_answering_still_works_after_a_restart(client):
    lid = biggest_builtin(client)["id"]
    sid = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]

    simulate_restart()

    q = client.get("/api/game/next", params={"session_id": sid}).json()
    a = client.post("/api/game/answer", json={
        "session_id": sid, "word_id": q["word_id"],
        "chosen": (q.get("options") or ["zzz"])[0], "time_ms": 700})
    assert a.status_code == 200, "answering raised Session not found after a restart"


def test_skip_still_works_after_a_restart(client):
    lid = biggest_builtin(client)["id"]
    sid = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]
    simulate_restart()
    q = client.get("/api/game/next", params={"session_id": sid}).json()
    assert client.post("/api/game/skip", params={
        "session_id": sid, "word_id": q["word_id"]}).status_code == 200


def test_all_in_one_keeps_its_mode_position(client):
    """The multi-mode state is the most complex thing being round-tripped."""
    lid = biggest_builtin(client)["id"]
    sid = client.post("/api/game/start", json={
        "list_id": lid, "mode": "all_in_one", "session_size": 4}).json()["session_id"]

    seen_index = 0
    for _ in range(12):
        q = client.get("/api/game/next", params={"session_id": sid})
        if q.status_code != 200 or not q.json().get("question_id"):
            break
        qj = q.json()
        a = client.post("/api/game/answer", json={
            "session_id": sid, "word_id": qj["word_id"],
            "chosen": (qj.get("options") or ["zzz"])[0], "time_ms": 700})
        seen_index = a.json()["mode_index"]

    simulate_restart()

    q = client.get("/api/game/next", params={"session_id": sid})
    if q.status_code == 200 and q.json().get("question_id"):
        a = client.post("/api/game/answer", json={
            "session_id": sid, "word_id": q.json()["word_id"],
            "chosen": (q.json().get("options") or ["zzz"])[0], "time_ms": 700})
        assert a.json()["mode_index"] >= seen_index, "the mode sequence restarted"


def test_unknown_session_is_still_rejected(client):
    r = client.post("/api/game/answer", json={
        "session_id": "does-not-exist", "word_id": 1, "chosen": "x", "time_ms": 100})
    assert r.status_code == 400


def test_set_field_survives_the_json_round_trip(client):
    """correctly_done_this_mode is a set; JSON has no set type."""
    lid = biggest_builtin(client)["id"]
    sid = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]
    q = client.get("/api/game/next", params={"session_id": sid}).json()
    client.post("/api/game/answer", json={
        "session_id": sid, "word_id": q["word_id"],
        "chosen": (q.get("options") or ["zzz"])[0], "time_ms": 700})

    simulate_restart()
    restored = game_engine._load(sid)
    assert isinstance(restored.correctly_done_this_mode, set)


def test_expired_sessions_are_purged(client, db):
    lid = biggest_builtin(client)["id"]
    stale = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]

    db.execute("UPDATE game_sessions SET updated_at = ? WHERE session_id = ?",
               ("2020-01-01 00:00:00", stale))
    db.commit()

    # Creating a session triggers the sweep.
    client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5})

    remaining = db.execute(
        "SELECT COUNT(*) FROM game_sessions WHERE session_id = ?", (stale,)).fetchone()[0]
    assert remaining == 0
