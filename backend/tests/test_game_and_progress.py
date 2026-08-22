"""Game modes, SM-2 bookkeeping, and the progress endpoints."""
import datetime as dt

import pytest

from conftest import biggest_builtin, play

MODES = ["multiple_choice", "reverse_mc", "listening", "reverse_type_it", "all_in_one"]


@pytest.fixture(scope="module")
def big_list(client):
    return biggest_builtin(client)["id"]


@pytest.mark.parametrize("mode", MODES)
def test_every_mode_runs(client, big_list, mode):
    assert play(client, big_list, mode=mode, size=4) > 0


def test_all_in_one_cycles_through_sub_modes(client, big_list):
    r = client.post("/api/game/start", json={
        "list_id": big_list, "mode": "all_in_one", "session_size": 4})
    sid = r.json()["session_id"]
    seen = set()
    for _ in range(60):
        q = client.get("/api/game/next", params={"session_id": sid})
        if q.status_code != 200 or not q.json().get("question_id"):
            break
        qj = q.json()
        seen.add(qj["mode"])
        client.post("/api/game/answer", json={
            "session_id": sid, "word_id": qj["word_id"],
            "chosen": (qj.get("options") or ["zzz"])[0], "time_ms": 700})
    assert len(seen) > 1, f"all_in_one stayed in one mode: {seen}"


def test_too_few_words_is_rejected(custom_list, client):
    lid, add = custom_list
    add([("een", "one"), ("twee", "two")])
    r = client.post("/api/game/start", json={
        "list_id": lid, "mode": "multiple_choice", "session_size": 5})
    assert r.status_code == 400
    assert "at least 4" in r.json()["detail"]


def test_unknown_list_is_rejected(client):
    r = client.post("/api/game/start", json={
        "list_id": 99999999, "mode": "multiple_choice", "session_size": 5})
    assert r.status_code == 400


def test_skip_marks_the_word_known(client, big_list):
    r = client.post("/api/game/start", json={
        "list_id": big_list, "mode": "multiple_choice", "session_size": 5})
    sid = r.json()["session_id"]
    q = client.get("/api/game/next", params={"session_id": sid}).json()
    assert client.post("/api/game/skip", params={
        "session_id": sid, "word_id": q["word_id"]}).status_code == 200


class TestSpacedRepetitionWrites:
    def test_answering_records_progress_and_events(self, client, big_list, db):
        play(client, big_list, size=4)
        assert db.execute("SELECT COUNT(*) FROM word_progress").fetchone()[0] > 0
        assert db.execute("SELECT COUNT(*) FROM answer_events").fetchone()[0] > 0

    def test_schedule_fields_round_trip(self, client, big_list, db):
        play(client, big_list, size=4)
        row = db.execute(
            "SELECT next_review_at, ease_factor, interval_days, repetitions "
            "FROM word_progress LIMIT 1").fetchone()
        # Postgres returns datetimes; the adapter renders them as SQLite did,
        # because the SM-2 comparisons and response models both expect text.
        dt.datetime.strptime(str(row["next_review_at"])[:19], "%Y-%m-%d %H:%M:%S")
        assert isinstance(row["ease_factor"], float)
        assert row["interval_days"] >= 1


class TestProgressEndpoints:
    def test_summary(self, client, big_list):
        r = client.get("/api/progress/summary", params={"list_id": big_list})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["total_words"] > 0
        assert isinstance(s["due_today"], int)
        assert s["mastered"] + s["in_progress"] + s["not_started"] == s["total_words"]

    def test_summary_for_missing_list_is_404(self, client):
        assert client.get("/api/progress/summary",
                          params={"list_id": 99999999}).status_code == 404

    def test_accuracy_window_sees_todays_answers(self, client, big_list):
        """Regression: a sign bug made the 7-day window look into the future."""
        play(client, big_list, size=4)
        s = client.get("/api/progress/summary", params={"list_id": big_list}).json()
        assert s["accuracy_7d"] is not None, \
            "the 7-day window matched nothing despite answers submitted today"

    def test_streak_counts_today(self, client, big_list):
        play(client, big_list, size=4)
        s = client.get("/api/progress/summary", params={"list_id": big_list}).json()
        assert s["current_streak"] >= 1

    def test_words_endpoint_shape(self, client, big_list):
        r = client.get("/api/progress/words", params={"list_id": big_list})
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) > 0
        assert {"word_id", "source_word", "modes", "learned"} <= set(rows[0])

    def test_heatmap_dates_are_iso(self, client, big_list):
        play(client, big_list, size=4)
        rows = client.get("/api/progress/heatmap").json()
        assert len(rows) >= 1
        for row in rows:
            dt.date.fromisoformat(row["date"])   # _compute_streak relies on this
