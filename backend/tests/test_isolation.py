"""One account must never see or touch another's data.

Every test here is an attempted breach. The built-in vocabulary is deliberately
shared — everyone studies the same 2,115 words — so the interesting cases are
the ones where two accounts study the *same* word and must not affect each
other.
"""
import io
import json

from conftest import biggest_builtin, current_user_id


def make_list(client, name, words):
    lid = client.post("/api/lists", params={"name": name}).json()["id"]
    ids = []
    for source, target in words:
        ids.append(client.post("/api/words/quick-add", json={
            "list_id": lid, "source_word": source, "target_word": target}).json()["id"])
    return lid, ids


class TestUnauthenticatedAccess:
    """Nothing that touches data may answer without credentials."""

    def test_every_data_endpoint_refuses(self, anon_client):
        for method, path, kwargs in [
            ("get", "/api/lists", {}),
            ("get", "/api/lists/1/words", {}),
            ("get", "/api/progress/summary", {"params": {"list_id": 1}}),
            ("get", "/api/progress/words", {"params": {"list_id": 1}}),
            ("get", "/api/progress/due", {}),
            ("get", "/api/progress/heatmap", {}),
            ("get", "/api/words/recent", {}),
            ("get", "/api/export", {}),
            ("post", "/api/lists", {"params": {"name": "x"}}),
            ("post", "/api/words/quick-add",
             {"json": {"list_id": 1, "source_word": "a", "target_word": "b"}}),
            ("post", "/api/words/reset-progress", {"json": {"word_ids": [1]}}),
            ("post", "/api/game/start",
             {"json": {"list_id": 1, "mode": "multiple_choice", "session_size": 5}}),
            ("get", "/api/game/next", {"params": {"session_id": "x"}}),
            ("patch", "/api/words/1/learned", {"json": {"learned": True}}),
            ("delete", "/api/words/1", {}),
            ("delete", "/api/lists/1", {}),
        ]:
            r = getattr(anon_client, method)(path, **kwargs)
            assert r.status_code == 401, f"{method.upper()} {path} answered {r.status_code}"

    def test_health_and_auth_stay_open(self, anon_client):
        assert anon_client.get("/api/health").status_code == 200
        assert anon_client.get("/api/auth/status").status_code == 200


class TestListIsolation:
    def test_another_accounts_list_is_invisible(self, client, other_client):
        lid, _ = make_list(client, "Private", [("geheim", "secret")])
        names = [l["name"] for l in other_client.get("/api/lists").json()]
        assert "Private" not in names

    def test_another_accounts_list_cannot_be_read(self, client, other_client):
        lid, _ = make_list(client, "Private2", [("geheim", "secret")])
        assert other_client.get(f"/api/lists/{lid}/words").status_code == 404

    def test_another_accounts_list_cannot_be_deleted(self, client, other_client):
        lid, _ = make_list(client, "Private3", [("geheim", "secret")])
        assert other_client.delete(f"/api/lists/{lid}").status_code == 404
        # still there for its owner
        assert client.get(f"/api/lists/{lid}/words").status_code == 200

    def test_words_cannot_be_added_to_another_accounts_list(self, client, other_client):
        lid, _ = make_list(client, "Private4", [("geheim", "secret")])
        r = other_client.post("/api/words/quick-add", json={
            "list_id": lid, "source_word": "inbraak", "target_word": "burglary"})
        assert r.status_code == 404
        assert len(client.get(f"/api/lists/{lid}/words").json()) == 1

    def test_another_accounts_word_cannot_be_edited_or_deleted(self, client, other_client):
        lid, ids = make_list(client, "Private5", [("geheim", "secret")])
        assert other_client.patch(f"/api/words/{ids[0]}",
                                  json={"target_word": "hacked"}).status_code == 404
        assert other_client.delete(f"/api/words/{ids[0]}").status_code == 404
        words = client.get(f"/api/lists/{lid}/words").json()
        assert words[0]["target_word"] == "secret"

    def test_recent_words_are_per_account(self, client, other_client):
        make_list(client, "Captured", [("stroopwafel", "syrup waffle")])
        mine = {w["source_word"] for w in client.get("/api/words/recent").json()}
        theirs = {w["source_word"] for w in other_client.get("/api/words/recent").json()}
        assert "stroopwafel" in mine
        assert "stroopwafel" not in theirs


class TestSharedBuiltinsStayShared:
    def test_both_accounts_see_the_built_in_lists(self, client, other_client):
        mine = {l["id"] for l in client.get("/api/lists", params={"builtin": "true"}).json()}
        theirs = {l["id"] for l in other_client.get("/api/lists", params={"builtin": "true"}).json()}
        assert mine and mine == theirs

    def test_built_in_lists_cannot_be_deleted(self, client):
        lid = biggest_builtin(client)["id"]
        assert client.delete(f"/api/lists/{lid}").status_code == 403


class TestProgressIsolation:
    def test_practice_does_not_show_up_in_another_account(self, client, other_client):
        lid = biggest_builtin(client)["id"]
        r = client.post("/api/game/start", json={
            "list_id": lid, "mode": "multiple_choice", "session_size": 5})
        sid = r.json()["session_id"]
        for _ in range(5):
            q = client.get("/api/game/next", params={"session_id": sid})
            if q.status_code != 200 or not q.json().get("question_id"):
                break
            qj = q.json()
            client.post("/api/game/answer", json={
                "session_id": sid, "word_id": qj["word_id"],
                "chosen": (qj.get("options") or ["zzz"])[0], "time_ms": 700})

        # Answers here are effectively random, so assert on activity rather than
        # on mastery, which only advances when the answer happens to be right.
        assert len(client.get("/api/progress/heatmap").json()) > 0
        assert other_client.get("/api/progress/heatmap").json() == []

        theirs = other_client.get("/api/progress/summary", params={"list_id": lid}).json()
        assert theirs["in_progress"] == 0 and theirs["mastered"] == 0
        assert theirs["accuracy_7d"] is None
        assert theirs["current_streak"] == 0

    def test_heatmap_is_per_account(self, client, other_client):
        assert other_client.get("/api/progress/heatmap").json() == []

    def test_due_queue_is_per_account(self, client, other_client, db):
        lid = biggest_builtin(client)["id"]
        word = client.get(f"/api/lists/{lid}/words").json()[0]
        db.execute("INSERT INTO word_progress (word_id, mode, user_id) VALUES (?, ?, ?)",
                   (word["id"], "listening", current_user_id(client)))
        db.execute("UPDATE word_progress SET next_review_at = ? WHERE word_id = ? AND user_id = ?",
                   ("2020-01-01 00:00:00", word["id"], current_user_id(client)))
        db.commit()

        assert client.get("/api/progress/due").json()["total"] >= 1
        assert other_client.get("/api/progress/due").json()["total"] == 0

    def test_resetting_progress_leaves_the_other_account_alone(self, client, other_client, db):
        lid = biggest_builtin(client)["id"]
        # Deliberately far down the list, and cleared first, so an earlier test
        # in this module cannot have left progress on it.
        word = client.get(f"/api/lists/{lid}/words").json()[-1]
        db.execute("DELETE FROM word_progress WHERE word_id = ?", (word["id"],))
        for c in (client, other_client):
            db.execute("INSERT INTO word_progress (word_id, mode, user_id) VALUES (?, ?, ?)",
                       (word["id"], "multiple_choice", current_user_id(c)))
        db.commit()

        client.post("/api/words/reset-progress", json={"word_ids": [word["id"]]})

        remaining = db.execute(
            "SELECT COUNT(*) AS n FROM word_progress WHERE word_id = ? AND user_id = ?",
            (word["id"], current_user_id(other_client))).fetchone()["n"]
        assert remaining == 1, "resetting one account's progress wiped another's"


class TestKnownFlagIsolation:
    """The flag used to be a column on the shared words table."""

    def test_marking_a_built_in_word_known_does_not_hide_it_for_others(self, client, other_client):
        lid = biggest_builtin(client)["id"]
        word = client.get(f"/api/lists/{lid}/words").json()[5]
        client.patch(f"/api/words/{word['id']}/learned", json={"learned": True})

        mine = next(w for w in client.get(f"/api/lists/{lid}/words").json()
                    if w["id"] == word["id"])
        theirs = next(w for w in other_client.get(f"/api/lists/{lid}/words").json()
                      if w["id"] == word["id"])
        assert mine["learned"] is True
        assert theirs["learned"] is False, "one account's known flag leaked to another"

    def test_a_word_known_by_someone_else_still_appears_in_practice(self, client, other_client):
        lid = biggest_builtin(client)["id"]
        words = client.get(f"/api/lists/{lid}/words").json()
        for w in words[:10]:
            client.patch(f"/api/words/{w['id']}/learned", json={"learned": True})
        # The other account has excluded nothing, so its pool is untouched.
        visible = other_client.get(f"/api/lists/{lid}/words",
                                   params={"exclude_mastered": "true"}).json()
        assert len(visible) == len(words)


class TestSessionIsolation:
    def test_another_accounts_session_cannot_be_read(self, client, other_client):
        lid = biggest_builtin(client)["id"]
        sid = client.post("/api/game/start", json={
            "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]
        assert other_client.get("/api/game/next",
                                params={"session_id": sid}).status_code == 404

    def test_another_accounts_session_cannot_be_answered(self, client, other_client):
        lid = biggest_builtin(client)["id"]
        sid = client.post("/api/game/start", json={
            "list_id": lid, "mode": "multiple_choice", "session_size": 5}).json()["session_id"]
        q = client.get("/api/game/next", params={"session_id": sid}).json()
        r = other_client.post("/api/game/answer", json={
            "session_id": sid, "word_id": q["word_id"], "chosen": "x", "time_ms": 100})
        assert r.status_code == 400

    def test_a_session_cannot_be_started_on_another_accounts_list(self, client, other_client):
        lid, _ = make_list(client, "PrivateGame",
                           [("a", "1"), ("b", "2"), ("c", "3"), ("d", "4"), ("e", "5")])
        r = other_client.post("/api/game/start", json={
            "list_id": lid, "mode": "multiple_choice", "session_size": 5})
        assert r.status_code == 400


class TestExportIsolation:
    def test_export_excludes_another_accounts_lists(self, client, other_client):
        make_list(client, "MyPrivateExport", [("geheim", "secret")])
        payload = other_client.get("/api/export").json()
        assert "MyPrivateExport" not in [l["name"] for l in payload["lists"]]

    def test_import_lands_in_the_importing_account(self, client, other_client):
        make_list(client, "Shared Export", [("kaas", "cheese")])
        payload = client.get("/api/export").json()

        buf = io.BytesIO(json.dumps(payload).encode())
        other_client.post("/api/import",
                          files={"file": ("e.json", buf, "application/json")})

        theirs = [l for l in other_client.get("/api/lists").json()
                  if l["name"] == "Shared Export"]
        assert len(theirs) == 1
        # A separate copy, not the original row.
        mine = [l for l in client.get("/api/lists").json() if l["name"] == "Shared Export"]
        assert mine and mine[0]["id"] != theirs[0]["id"]


class TestStartOver:
    def test_reset_wipes_history_but_keeps_lists(self, client):
        lid = biggest_builtin(client)["id"]
        r = client.post("/api/game/start", json={
            "list_id": lid, "mode": "multiple_choice", "session_size": 5})
        sid = r.json()["session_id"]
        q = client.get("/api/game/next", params={"session_id": sid}).json()
        client.post("/api/game/answer", json={
            "session_id": sid, "word_id": q["word_id"],
            "chosen": (q.get("options") or ["zzz"])[0], "time_ms": 700})
        assert len(client.get("/api/progress/heatmap").json()) > 0

        mine, _ = make_list(client, "Kept After Reset", [("blijven", "to stay")])

        assert client.post("/api/progress/reset-all").status_code == 204

        assert client.get("/api/progress/heatmap").json() == []
        assert client.get("/api/progress/due").json()["total"] == 0
        summary = client.get("/api/progress/summary", params={"list_id": lid}).json()
        assert summary["in_progress"] == 0 and summary["mastered"] == 0
        assert summary["current_streak"] == 0
        # Word lists survive; only the learning history goes.
        assert client.get(f"/api/lists/{mine}/words").status_code == 200
        assert len(client.get(f"/api/lists/{lid}/words").json()) > 0

    def test_reset_does_not_touch_another_account(self, client, other_client, db):
        lid = biggest_builtin(client)["id"]
        word = client.get(f"/api/lists/{lid}/words").json()[3]
        db.execute("DELETE FROM word_progress WHERE word_id = ?", (word["id"],))
        db.execute("INSERT INTO word_progress (word_id, mode, user_id) VALUES (?, ?, ?)",
                   (word["id"], "listening", current_user_id(other_client)))
        db.commit()

        client.post("/api/progress/reset-all")

        remaining = db.execute(
            "SELECT COUNT(*) AS n FROM word_progress WHERE user_id = ?",
            (current_user_id(other_client),)).fetchone()["n"]
        assert remaining >= 1

    def test_reset_requires_an_account(self, anon_client):
        assert anon_client.post("/api/progress/reset-all").status_code == 401
