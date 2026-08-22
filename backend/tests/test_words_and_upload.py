"""Lists, words, and the upload path."""
from conftest import biggest_builtin


def test_builtin_lists_are_seeded(client):
    lists = client.get("/api/lists").json()
    assert len(lists) >= 40
    assert sum(l.get("word_count") or 0 for l in lists) > 1500


def test_create_list_returns_a_real_id(client):
    r = client.post("/api/lists", params={"name": "Fresh List"})
    assert r.status_code == 201, r.text
    # Postgres has no lastrowid; the adapter supplies it via RETURNING id.
    assert isinstance(r.json()["id"], int) and r.json()["id"] > 0


def test_quick_add_and_fetch(custom_list, client):
    lid, add = custom_list
    ids = add([("hond", "dog"), ("kat", "cat")])
    assert all(isinstance(i, int) and i > 0 for i in ids)
    words = client.get(f"/api/lists/{lid}/words").json()
    assert {w["source_word"] for w in words} == {"hond", "kat"}


def test_quick_add_is_idempotent(custom_list, client):
    lid, add = custom_list
    first = add([("fiets", "bicycle")])[0]
    again = add([("fiets", "bicycle")])[0]
    assert first == again
    assert len(client.get(f"/api/lists/{lid}/words").json()) == 1


class TestUploadConfirm:
    """A duplicate inside an upload used to destroy the entire upload.

    SQLite skips the offending row; Postgres aborts the transaction, so the
    commit discarded every word AND the list, while the API still reported
    success with a positive word_count.
    """

    PAYLOAD = {
        "list_name": "Numbers", "source_lang": "nl", "target_lang": "en",
        "words": [
            {"source_word": "een", "target_word": "one"},
            {"source_word": "twee", "target_word": "two"},
            {"source_word": "een", "target_word": "one again"},   # duplicate
            {"source_word": "drie", "target_word": "three"},
            {"source_word": "vier", "target_word": "four"},
        ],
    }

    def test_duplicate_does_not_discard_the_upload(self, client):
        r = client.post("/api/upload/confirm", json=self.PAYLOAD)
        assert r.status_code == 200, r.text
        stored = client.get(f"/api/lists/{r.json()['list_id']}/words").json()
        assert len(stored) == 4
        assert {w["source_word"] for w in stored} == {"een", "twee", "drie", "vier"}

    def test_reported_count_matches_what_was_stored(self, client):
        r = client.post("/api/upload/confirm", json={**self.PAYLOAD, "list_name": "Numbers 2"})
        stored = client.get(f"/api/lists/{r.json()['list_id']}/words").json()
        assert r.json()["word_count"] == len(stored)

    def test_connection_survives_the_duplicate(self, client):
        client.post("/api/upload/confirm", json={**self.PAYLOAD, "list_name": "Numbers 3"})
        assert client.get("/api/lists").status_code == 200

    def test_empty_upload_rejected(self, client):
        r = client.post("/api/upload/confirm", json={
            "list_name": "Empty", "source_lang": "nl", "target_lang": "en", "words": []})
        assert r.status_code == 422


class TestMutations:
    def test_update_word(self, custom_list, client):
        lid, add = custom_list
        wid = add([("boom", "tree")])[0]
        r = client.patch(f"/api/words/{wid}", json={"target_word": "TREE"})
        assert r.status_code == 200, r.text
        assert r.json()["target_word"] == "TREE"

    def test_learned_toggle(self, custom_list, client):
        lid, add = custom_list
        wid = add([("boek", "book")])[0]
        assert client.patch(f"/api/words/{wid}/learned", json={"learned": True}).status_code == 204
        words = client.get(f"/api/lists/{lid}/words").json()
        assert next(w for w in words if w["id"] == wid)["learned"] is True

    def test_delete_word(self, custom_list, client):
        lid, add = custom_list
        wid = add([("stoel", "chair")])[0]
        assert client.delete(f"/api/words/{wid}").status_code == 204
        assert client.get(f"/api/lists/{lid}/words").json() == []

    def test_delete_missing_word_is_404(self, client):
        # rowcount is read after the connection closes; psycopg is stricter here.
        assert client.delete("/api/words/99999999").status_code == 404

    def test_delete_list_cascades(self, client):
        lid = client.post("/api/lists", params={"name": "Doomed"}).json()["id"]
        client.post("/api/words/quick-add", json={
            "list_id": lid, "source_word": "weg", "target_word": "road"})
        assert client.delete(f"/api/lists/{lid}").status_code == 204
        # The list is gone, so its words are unreachable rather than empty.
        assert client.get(f"/api/lists/{lid}/words").status_code == 404


def test_exclude_mastered_filter(client):
    lid = biggest_builtin(client)["id"]
    r = client.get(f"/api/lists/{lid}/words", params={"exclude_mastered": "true"})
    assert r.status_code == 200


def test_reset_progress_accepts_a_list_of_ids(custom_list, client):
    lid, add = custom_list
    ids = add([("een", "one"), ("twee", "two")])
    assert client.post("/api/words/reset-progress", json={"word_ids": ids}).status_code == 204
