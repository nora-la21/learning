"""The drill-down behind the "Mastered" tile.

The number on the tile is summed from the per-list mastered_count; the list of
words comes from a separate query. If the two ever disagree the feature is
worse than useless, so most of what is checked here is that they agree.
"""
from conftest import biggest_builtin

MODES = ("multiple_choice", "reverse_mc", "listening", "reverse_type_it")


def tile_total(client) -> int:
    """What the Progress & statistics page adds up for the tile."""
    return sum(l.get("mastered_count") or 0 for l in client.get("/api/lists").json())


def master(db, user_id: int, word_id: int, modes=MODES) -> None:
    # Earlier tests in this module play real sessions, so a built-in word may
    # already carry progress rows; replace them rather than colliding.
    db.execute("DELETE FROM word_progress WHERE user_id = ? AND word_id = ?",
               (user_id, word_id))
    for mode in modes:
        db.execute(
            "INSERT INTO word_progress (user_id, word_id, mode, repetitions, "
            "correct_count, mastered) VALUES (?, ?, ?, 5, 5, 1)",
            (user_id, word_id, mode))
    db.commit()


def test_empty_account_has_no_mastered_words(client):
    r = client.get("/api/progress/mastered")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 0 and body["words"] == []
    assert tile_total(client) == 0


def test_a_fully_mastered_word_appears(client, db, custom_list):
    uid = client.get("/api/auth/me").json()["id"]
    lid, add = custom_list
    (wid,) = add([("aardbei", "strawberry")])
    master(db, uid, wid)

    body = client.get("/api/progress/mastered").json()
    assert [w["source_word"] for w in body["words"]] == ["aardbei"]
    word = body["words"][0]
    assert word["target_word"] == "strawberry"
    assert word["list_id"] == lid
    assert word["marked_known"] is False
    assert word["mastered_modes"] == 4
    assert word["total_correct"] == 20
    assert body["total"] == tile_total(client) == 1


def test_partial_mastery_does_not_count(client, db, custom_list):
    """Three modes out of four is not mastery, and must not be listed."""
    uid = client.get("/api/auth/me").json()["id"]
    _, add = custom_list
    (wid,) = add([("perzik", "peach")])
    master(db, uid, wid, MODES[:3])

    body = client.get("/api/progress/mastered").json()
    assert "perzik" not in [w["source_word"] for w in body["words"]]
    assert body["total"] == tile_total(client)


def test_marked_known_counts_and_is_labelled(client, custom_list):
    _, add = custom_list
    (wid,) = add([("kers", "cherry")])
    assert client.patch(f"/api/words/{wid}/learned", json={"learned": True}).status_code == 204

    words = client.get("/api/progress/mastered").json()["words"]
    entry = next(w for w in words if w["source_word"] == "kers")
    assert entry["marked_known"] is True
    assert entry["mastered_modes"] == 0
    assert client.get("/api/progress/mastered").json()["total"] == tile_total(client)


def test_unmarking_known_removes_it_again(client, custom_list):
    _, add = custom_list
    (wid,) = add([("pruim", "plum")])
    client.patch(f"/api/words/{wid}/learned", json={"learned": True})
    assert "pruim" in [w["source_word"] for w in client.get("/api/progress/mastered").json()["words"]]

    client.patch(f"/api/words/{wid}/learned", json={"learned": False})
    body = client.get("/api/progress/mastered").json()
    assert "pruim" not in [w["source_word"] for w in body["words"]]
    assert body["total"] == tile_total(client)


def test_total_matches_the_tile_after_real_practice(client):
    """Play a built-in list for real, then compare the two numbers."""
    from conftest import play
    lst = biggest_builtin(client)
    for _ in range(3):
        play(client, lst["id"], mode="all_in_one", size=5, rounds=60)
    body = client.get("/api/progress/mastered").json()
    assert body["total"] == len(body["words"]) == tile_total(client)


def test_another_account_sees_none_of_it(client, other_client, db, custom_list):
    uid = client.get("/api/auth/me").json()["id"]
    _, add = custom_list
    (wid,) = add([("framboos", "raspberry")])
    master(db, uid, wid)

    mine = client.get("/api/progress/mastered").json()
    theirs = other_client.get("/api/progress/mastered").json()
    assert "framboos" in [w["source_word"] for w in mine["words"]]
    assert theirs["total"] == 0
    assert theirs["words"] == []


def test_mastery_on_a_shared_builtin_word_does_not_leak(client, other_client, db):
    """Built-in lists are shared, so their progress must still be per account."""
    uid = client.get("/api/auth/me").json()["id"]
    lst = biggest_builtin(client)
    wid = client.get(f"/api/lists/{lst['id']}/words").json()[0]["id"]
    master(db, uid, wid)

    assert wid in [w["word_id"] for w in client.get("/api/progress/mastered").json()["words"]]
    assert wid not in [w["word_id"] for w in other_client.get("/api/progress/mastered").json()["words"]]


def test_a_private_list_stays_out_of_another_account(client, other_client, db):
    """The endpoint scopes by list visibility, not just by progress rows."""
    lid = other_client.post("/api/lists", params={"name": "Their List"}).json()["id"]
    r = other_client.post("/api/words/quick-add", json={
        "list_id": lid, "source_word": "geheim", "target_word": "secret"})
    wid = r.json()["id"]
    other_uid = other_client.get("/api/auth/me").json()["id"]
    master(db, other_uid, wid)

    assert "geheim" not in [w["source_word"] for w in client.get("/api/progress/mastered").json()["words"]]
    assert "geheim" in [w["source_word"] for w in other_client.get("/api/progress/mastered").json()["words"]]


def test_requires_an_account(anon_client):
    assert anon_client.get("/api/progress/mastered").status_code == 401


def test_reset_all_clears_the_list(client, db, custom_list):
    uid = client.get("/api/auth/me").json()["id"]
    _, add = custom_list
    (wid,) = add([("citroen", "lemon")])
    master(db, uid, wid)
    assert client.get("/api/progress/mastered").json()["total"] > 0

    assert client.post("/api/progress/reset-all").status_code == 204
    body = client.get("/api/progress/mastered").json()
    assert body["total"] == 0
    assert tile_total(client) == 0
