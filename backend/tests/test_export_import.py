"""Export and import.

Downloading the SQLite file never worked on Postgres, which left no way at all
to get your data out. This moves the data rather than the file, so it behaves
the same on either backend.
"""
import io
import json

import database
from services import progress_engine
from conftest import biggest_builtin, current_user_id


def do_export(client):
    r = client.get("/api/export")
    assert r.status_code == 200, r.text
    return r.json()


def do_import(client, payload):
    buf = io.BytesIO(json.dumps(payload).encode("utf-8"))
    r = client.post("/api/import", files={"file": ("export.json", buf, "application/json")})
    assert r.status_code == 200, r.text
    return r.json()


def test_export_is_well_formed(client):
    payload = do_export(client)
    assert payload["format"] == "dutch-vocab-export"
    assert payload["version"] == 1
    assert isinstance(payload["lists"], list)


def test_export_carries_user_lists_but_not_builtin_vocabulary(client, custom_list):
    lid, add = custom_list
    add([("fiets", "bicycle"), ("gracht", "canal")])
    payload = do_export(client)

    mine = next(l for l in payload["lists"] if l["name"] == "Test List")
    assert {w["source_word"] for w in mine["words"]} == {"fiets", "gracht"}
    # Built-ins ship with the app; re-exporting 2000+ seeded words is noise.
    assert all(l["name"] == "Test List" or "🇳🇱" not in l["name"] for l in payload["lists"])
    assert len(payload["lists"]) < 50


def test_round_trip_restores_a_deleted_list(client):
    lid = client.post("/api/lists", params={"name": "Trip"}).json()["id"]
    for source, target in [("boom", "tree"), ("boek", "book")]:
        client.post("/api/words/quick-add", json={
            "list_id": lid, "source_word": source, "target_word": target})

    payload = do_export(client)
    assert client.delete(f"/api/lists/{lid}").status_code == 204
    assert not [l for l in client.get("/api/lists").json() if l["name"] == "Trip"]

    result = do_import(client, payload)
    assert result["lists_added"] >= 1

    restored = next(l for l in client.get("/api/lists").json() if l["name"] == "Trip")
    words = client.get(f"/api/lists/{restored['id']}/words").json()
    assert {w["source_word"] for w in words} == {"boom", "boek"}


def test_import_is_idempotent(client):
    lid = client.post("/api/lists", params={"name": "Twice"}).json()["id"]
    client.post("/api/words/quick-add", json={
        "list_id": lid, "source_word": "kaas", "target_word": "cheese"})

    payload = do_export(client)
    do_import(client, payload)
    second = do_import(client, payload)

    assert second["lists_added"] == 0
    assert second["words_added"] == 0
    matches = [l for l in client.get("/api/lists").json() if l["name"] == "Twice"]
    assert len(matches) == 1


def test_progress_survives_the_round_trip(client):
    lid = client.post("/api/lists", params={"name": "WithProgress"}).json()["id"]
    wid = client.post("/api/words/quick-add", json={
        "list_id": lid, "source_word": "trein", "target_word": "train"}).json()["id"]
    for _ in range(4):
        progress_engine.update_word_progress(wid, True, 800, "multiple_choice", user_id=current_user_id(client))

    payload = do_export(client)
    exported = next(l for l in payload["lists"] if l["name"] == "WithProgress")
    entry = exported["words"][0]["progress"][0]
    assert entry["mode"] == "multiple_choice"
    assert entry["repetitions"] >= 1

    client.delete(f"/api/lists/{lid}")
    do_import(client, payload)

    restored_list = next(l for l in client.get("/api/lists").json() if l["name"] == "WithProgress")
    rows = client.get("/api/progress/words", params={"list_id": restored_list["id"]}).json()
    modes = rows[0]["modes"]
    assert modes and modes[0]["repetitions"] == entry["repetitions"]


def test_known_flag_survives(client):
    lid = client.post("/api/lists", params={"name": "KnownFlag"}).json()["id"]
    wid = client.post("/api/words/quick-add", json={
        "list_id": lid, "source_word": "melk", "target_word": "milk"}).json()["id"]
    client.patch(f"/api/words/{wid}/learned", json={"learned": True})

    payload = do_export(client)
    client.delete(f"/api/lists/{lid}")
    do_import(client, payload)

    restored = next(l for l in client.get("/api/lists").json() if l["name"] == "KnownFlag")
    words = client.get(f"/api/lists/{restored['id']}/words").json()
    assert words[0]["learned"] is True


def test_builtin_progress_is_keyed_by_word_not_id(client):
    """Row ids differ between installs; the vocabulary does not."""
    big = biggest_builtin(client)
    word = client.get(f"/api/lists/{big['id']}/words").json()[0]
    for _ in range(4):
        progress_engine.update_word_progress(word["id"], True, 800, "listening", user_id=current_user_id(client))

    payload = do_export(client)
    entry = next(e for e in payload["builtin_progress"]
                 if e["source_word"] == word["source_word"])
    assert entry["list_name"] == big["name"]
    assert any(p["mode"] == "listening" for p in entry["progress"])

    # Wipe that progress, then restore it by word rather than by id.
    conn = database.get_db()
    conn.execute("DELETE FROM word_progress WHERE word_id = ?", (word["id"],))
    conn.commit()
    conn.close()

    assert do_import(client, payload)["progress_restored"] >= 1
    rows = client.get("/api/progress/words", params={"list_id": big["id"]}).json()
    target = next(r for r in rows if r["word_id"] == word["id"])
    assert any(m["mode"] == "listening" for m in target["modes"])


def test_existing_progress_is_not_overwritten(client):
    lid = client.post("/api/lists", params={"name": "NoClobber"}).json()["id"]
    wid = client.post("/api/words/quick-add", json={
        "list_id": lid, "source_word": "zon", "target_word": "sun"}).json()["id"]
    for _ in range(2):
        progress_engine.update_word_progress(wid, True, 800, "multiple_choice", user_id=current_user_id(client))
    payload = do_export(client)

    for _ in range(6):
        progress_engine.update_word_progress(wid, True, 800, "multiple_choice", user_id=current_user_id(client))
    rows = client.get("/api/progress/words", params={"list_id": lid}).json()
    current = rows[0]["modes"][0]["repetitions"]

    do_import(client, payload)
    rows = client.get("/api/progress/words", params={"list_id": lid}).json()
    assert rows[0]["modes"][0]["repetitions"] == current, \
        "importing an older export rolled live progress backwards"


class TestRejections:
    def test_rejects_non_json(self, client):
        buf = io.BytesIO(b"this is not json")
        r = client.post("/api/import", files={"file": ("x.json", buf, "application/json")})
        assert r.status_code == 400

    def test_rejects_a_foreign_json_file(self, client):
        buf = io.BytesIO(json.dumps({"hello": "world"}).encode())
        r = client.post("/api/import", files={"file": ("x.json", buf, "application/json")})
        assert r.status_code == 400
        assert "not a vocabulary export" in r.json()["detail"]

    def test_rejects_a_future_version(self, client):
        payload = {"format": "dutch-vocab-export", "version": 999, "lists": []}
        buf = io.BytesIO(json.dumps(payload).encode())
        r = client.post("/api/import", files={"file": ("x.json", buf, "application/json")})
        assert r.status_code == 400
        assert "version" in r.json()["detail"].lower()


def test_export_endpoint_sets_a_download_filename(client):
    r = client.get("/api/export")
    assert "attachment" in r.headers["content-disposition"]
    assert "vocabulary-export.json" in r.headers["content-disposition"]
