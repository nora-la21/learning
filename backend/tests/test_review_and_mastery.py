"""The review queue, recently-saved words, and the known-on-typing setting."""
import pytest

import database
from services import progress_engine
from conftest import biggest_builtin, current_user_id

TYPING = "reverse_type_it"


@pytest.fixture(scope="module")
def big_list(client):
    return biggest_builtin(client)["id"]


def schedule(word_id, mode, when, user_id):
    """Backdate (or postdate) a word's next review for one account."""
    conn = database.get_db()
    conn.execute("INSERT INTO word_progress (word_id, mode, user_id) VALUES (?, ?, ?)",
                 (word_id, mode, user_id))
    conn.execute(
        "UPDATE word_progress SET next_review_at = ?, repetitions = 3 "
        "WHERE word_id = ? AND mode = ? AND user_id = ?", (when, word_id, mode, user_id))
    conn.commit()
    conn.close()


def is_known(word_id, user_id):
    conn = database.get_db()
    row = conn.execute(
        "SELECT known FROM user_word_flags WHERE word_id = ? AND user_id = ?",
        (word_id, user_id)).fetchone()
    conn.close()
    return bool(row and row["known"])


class TestDueQueue:
    def test_nothing_due_before_practising(self, client):
        d = client.get("/api/progress/due").json()
        assert d["total"] == 0
        assert d["primary_list_id"] is None
        assert d["word_ids"] == []

    def test_ordered_by_how_overdue(self, client, big_list):
        words = client.get(f"/api/lists/{big_list}/words").json()
        oldest, middle, newest, future = (w["id"] for w in words[:4])
        uid = current_user_id(client)
        schedule(oldest, "multiple_choice", "2020-01-01 00:00:00", uid)
        schedule(middle, "multiple_choice", "2021-01-01 00:00:00", uid)
        schedule(newest, "listening", "2022-01-01 00:00:00", uid)
        schedule(future, "multiple_choice", "2099-01-01 00:00:00", uid)

        d = client.get("/api/progress/due").json()
        assert d["total"] == 3
        assert future not in d["word_ids"], "a word scheduled for 2099 is not due"
        assert d["word_ids"][:3] == [oldest, middle, newest]
        assert d["primary_list_id"] == big_list
        assert sum(e["count"] for e in d["by_list"]) == 3
        assert all(e["name"] for e in d["by_list"])

    def test_known_words_drop_out(self, client, big_list):
        words = client.get(f"/api/lists/{big_list}/words").json()
        target = words[10]["id"]
        schedule(target, "multiple_choice", "2020-01-01 00:00:00", current_user_id(client))
        before = client.get("/api/progress/due").json()["total"]

        client.patch(f"/api/words/{target}/learned", json={"learned": True})
        assert client.get("/api/progress/due").json()["total"] == before - 1

        client.patch(f"/api/words/{target}/learned", json={"learned": False})
        assert client.get("/api/progress/due").json()["total"] == before

    def test_review_session_takes_the_most_overdue(self, client, big_list):
        words = client.get(f"/api/lists/{big_list}/words").json()
        due = client.get("/api/progress/due").json()
        assert due["total"] >= 3
        # Pad past the 4-word minimum with words that are not due.
        pool = due["word_ids"] + [w["id"] for w in words[20:30]]

        r = client.post("/api/game/start", json={
            "list_id": due["primary_list_id"], "mode": "multiple_choice",
            "session_size": 3, "word_ids": pool, "review": True})
        assert r.status_code == 200, r.text
        assert r.json()["total"] == 3

        sid = r.json()["session_id"]
        drawn = set()
        for _ in range(6):
            q = client.get("/api/game/next", params={"session_id": sid})
            if q.status_code != 200 or not q.json().get("question_id"):
                break
            qj = q.json()
            drawn.add(qj["word_id"])
            client.post("/api/game/answer", json={
                "session_id": sid, "word_id": qj["word_id"],
                "chosen": (qj.get("options") or ["zzz"])[0], "time_ms": 700})
        assert drawn <= set(due["word_ids"]), \
            "review truncated to an arbitrary slice instead of the most overdue"


class TestRecentlySaved:
    def test_lists_captured_words_newest_first(self, client):
        lid = client.post("/api/lists", params={"name": "Saved from web"}).json()["id"]
        for source, target in [("fiets", "bicycle"), ("gracht", "canal")]:
            client.post("/api/words/quick-add", json={
                "list_id": lid, "source_word": source, "target_word": target})

        rows = client.get("/api/words/recent").json()
        assert {"fiets", "gracht"} <= {w["source_word"] for w in rows}
        assert all(w["list_name"] for w in rows)

    def test_builtin_lists_are_excluded(self, client):
        """Built-ins are bulk-seeded at startup and would swamp real captures."""
        rows = client.get("/api/words/recent").json()
        builtin_ids = {l["id"] for l in client.get("/api/lists", params={"builtin": "true"}).json()}
        assert not ({w["list_id"] for w in rows} & builtin_ids)

    def test_limit_is_respected(self, client):
        lid = client.post("/api/lists", params={"name": "Many"}).json()["id"]
        for i in range(5):
            client.post("/api/words/quick-add", json={
                "list_id": lid, "source_word": f"woord{i}", "target_word": f"word{i}"})
        assert len(client.get("/api/words/recent", params={"limit": 2}).json()) == 2


class TestKnownOnTypingMastery:
    """Opt-in: mastering the typing mode marks the whole word known."""

    def drive_to_mastery(self, word_id, mode, flag, user_id, rounds=12):
        for _ in range(rounds):
            progress_engine.update_word_progress(
                word_id, True, 900, mode, known_on_type_mastery=flag, user_id=user_id)
        conn = database.get_db()
        row = conn.execute(
            "SELECT mastered FROM word_progress WHERE word_id=? AND mode=? AND user_id=?",
            (word_id, mode, user_id)).fetchone()
        conn.close()
        return bool(row["mastered"])

    def test_off_by_default(self, client, big_list):
        uid = current_user_id(client)
        wid = client.get(f"/api/lists/{big_list}/words").json()[30]["id"]
        assert self.drive_to_mastery(wid, TYPING, False, uid)
        assert not is_known(wid, uid)

    def test_on_marks_word_known(self, client, big_list):
        uid = current_user_id(client)
        wid = client.get(f"/api/lists/{big_list}/words").json()[31]["id"]
        assert self.drive_to_mastery(wid, TYPING, True, uid)
        assert is_known(wid, uid)

    def test_only_the_typing_mode_counts(self, client, big_list):
        uid = current_user_id(client)
        wid = client.get(f"/api/lists/{big_list}/words").json()[32]["id"]
        assert self.drive_to_mastery(wid, "multiple_choice", True, uid)
        assert not is_known(wid, uid)

    def test_flag_travels_over_http(self, client, big_list):
        r = client.post("/api/game/start", json={
            "list_id": big_list, "mode": TYPING, "session_size": 3})
        sid = r.json()["session_id"]
        q = client.get("/api/game/next", params={"session_id": sid}).json()
        assert client.post("/api/game/answer", json={
            "session_id": sid, "word_id": q["word_id"], "chosen": "zzz",
            "time_ms": 800, "known_on_type_mastery": True}).status_code == 200

    def test_field_is_optional(self, client, big_list):
        """Older clients omit it entirely."""
        r = client.post("/api/game/start", json={
            "list_id": big_list, "mode": TYPING, "session_size": 3})
        sid = r.json()["session_id"]
        q = client.get("/api/game/next", params={"session_id": sid}).json()
        assert client.post("/api/game/answer", json={
            "session_id": sid, "word_id": q["word_id"],
            "chosen": "zzz", "time_ms": 800}).status_code == 200


class TestMasteryIgnoresSpeed:
    """Mastery is five correct answers in a row, however long each one took.

    Answers used to be graded on speed: over five seconds scored 3, which held
    the ease factor flat so the interval never reached the 21 days mastery
    requires. A slower learner could answer correctly indefinitely and never
    master anything.
    """

    def reps_until_mastered(self, word_id, user_id, time_ms, mode="reverse_type_it"):
        for n in range(1, 10):
            progress_engine.update_word_progress(
                word_id, True, time_ms, mode, user_id=user_id)
            conn = database.get_db()
            row = conn.execute(
                "SELECT mastered FROM word_progress "
                "WHERE word_id=? AND mode=? AND user_id=?",
                (word_id, mode, user_id)).fetchone()
            conn.close()
            if row and row["mastered"]:
                return n
        return None

    @pytest.mark.parametrize("time_ms", [500, 3000, 9000, 60000])
    def test_five_in_a_row_masters_at_any_speed(self, client, big_list, time_ms):
        uid = current_user_id(client)
        words = client.get(f"/api/lists/{big_list}/words").json()
        # A different word per speed, so the runs cannot interfere.
        word_id = words[40 + [500, 3000, 9000, 60000].index(time_ms)]["id"]
        assert self.reps_until_mastered(word_id, uid, time_ms) == 5

    def test_a_wrong_answer_restarts_the_streak(self, client, big_list):
        uid = current_user_id(client)
        word_id = client.get(f"/api/lists/{big_list}/words").json()[45]["id"]
        for _ in range(4):
            progress_engine.update_word_progress(
                word_id, True, 9000, "listening", user_id=uid)
        progress_engine.update_word_progress(
            word_id, False, 9000, "listening", user_id=uid)

        conn = database.get_db()
        row = conn.execute(
            "SELECT repetitions, mastered FROM word_progress "
            "WHERE word_id=? AND mode=? AND user_id=?",
            (word_id, "listening", uid)).fetchone()
        conn.close()
        assert row["repetitions"] == 0
        assert not row["mastered"]
