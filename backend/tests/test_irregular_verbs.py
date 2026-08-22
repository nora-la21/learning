"""The irregular-verb section.

A strong verb is not a word with a translation: it is a set of principal parts,
each of which has to be recalled separately. The modes mirror the columns of a
conjugation table, and progress is tracked per (verb, mode) so knowing the
participle does not excuse you from the plural past.
"""
import database
from data.irregular_verbs import IRREGULAR_VERBS


class TestVerbTable:
    def test_every_row_is_complete(self):
        for row in IRREGULAR_VERBS:
            assert len(row) == 6, row
            for field in row:
                assert field and field.strip(), row

    def test_infinitives_are_unique(self):
        seen = set()
        for row in IRREGULAR_VERBS:
            assert row[0] not in seen, f"{row[0]} appears twice"
            seen.add(row[0])

    def test_auxiliary_is_hebben_zijn_or_both(self):
        for inf, _, _, _, aux, _ in IRREGULAR_VERBS:
            assert aux in {"hebben", "zijn", "hebben/zijn"}, (inf, aux)

    def test_the_forms_actually_differ(self):
        """A verb whose past equals its infinitive is not irregular."""
        for inf, sg, pl, part, _, _ in IRREGULAR_VERBS:
            assert sg != inf, inf
            assert pl != sg or inf in {"zullen"}, inf

    def test_known_verbs_are_correct(self):
        table = {r[0]: r for r in IRREGULAR_VERBS}
        assert table["zijn"][1:5] == ("was", "waren", "geweest", "zijn")
        assert table["hebben"][1:5] == ("had", "hadden", "gehad", "hebben")
        assert table["breken"][1:4] == ("brak", "braken", "gebroken")
        assert table["lopen"][4] == "hebben/zijn"
        assert table["blijven"][4] == "zijn"
        assert table["gaan"][1:5] == ("ging", "gingen", "gegaan", "zijn")

    def test_singular_and_plural_past_are_both_present(self):
        """Dutch distinguishes ik brak from wij braken; both must be drillable."""
        for inf, sg, pl, _, _, _ in IRREGULAR_VERBS:
            assert sg and pl, inf


class TestVerbSeeding:
    def test_all_verbs_are_seeded(self, client, db):
        n = db.execute("SELECT COUNT(*) AS n FROM irregular_verbs").fetchone()["n"]
        assert n == len(IRREGULAR_VERBS)

    def test_seeding_is_idempotent(self, client, db):
        before = db.execute("SELECT COUNT(*) AS n FROM irregular_verbs").fetchone()["n"]
        for _ in range(3):
            database.seed_irregular_verbs()
        after = db.execute("SELECT COUNT(*) AS n FROM irregular_verbs").fetchone()["n"]
        assert after == before

    def test_a_corrected_form_reaches_an_existing_database(self, client, db):
        """Fixing a mistake in the table must update the row, not orphan it."""
        db.execute("UPDATE irregular_verbs SET participle = ? WHERE infinitive = ?",
                   ("WRONG", "lopen"))
        db.commit()
        database.seed_irregular_verbs()
        row = db.execute(
            "SELECT id, participle FROM irregular_verbs WHERE infinitive = ?",
            ("lopen",)).fetchone()
        assert row["participle"] == "gelopen"


class TestVerbApi:
    def test_listing_returns_the_whole_table(self, client):
        rows = client.get("/api/verbs/").json()
        assert len(rows) == len(IRREGULAR_VERBS)
        first = rows[0]
        assert {"infinitive", "past_singular", "past_plural",
                "participle", "auxiliary", "meaning"} <= set(first)

    def test_summary_lists_every_mode(self, client):
        body = client.get("/api/verbs/summary").json()
        assert body["total_verbs"] == len(IRREGULAR_VERBS)
        modes = {m["mode"] for m in body["modes"]}
        assert {"past_singular", "past_plural", "participle", "auxiliary"} <= modes

    def test_requires_an_account(self, anon_client):
        for path in ["/api/verbs/", "/api/verbs/summary"]:
            assert anon_client.get(path).status_code == 401
        assert anon_client.post("/api/verbs/game/start",
                                json={"mode": "participle"}).status_code == 401

    def test_unknown_mode_is_rejected(self, client):
        r = client.post("/api/verbs/game/start", json={"mode": "nonsense"})
        assert r.status_code == 400


class TestVerbGame:
    def play(self, client, mode, size=4, always_right=True):
        start = client.post("/api/verbs/game/start",
                            json={"mode": mode, "session_size": size})
        assert start.status_code == 200, start.text
        sid = start.json()["session_id"]
        seen_modes, answered = set(), 0
        for _ in range(start.json()["total"] + 2):
            q = client.get("/api/verbs/game/next", params={"session_id": sid})
            if q.status_code != 200:
                break
            qj = q.json()
            seen_modes.add(qj["mode"])
            table = client.get("/api/verbs/").json()
            verb = next(v for v in table if v["id"] == qj["verb_id"])
            answer = verb[qj["mode"]] if always_right else "definitely wrong"
            a = client.post("/api/verbs/game/answer", json={
                "session_id": sid, "verb_id": qj["verb_id"], "mode": qj["mode"],
                "answer": answer, "time_ms": 900})
            assert a.status_code == 200, a.text
            assert a.json()["correct"] is always_right
            answered += 1
        return answered, seen_modes

    def test_each_single_mode_plays(self, client):
        for mode in ["past_singular", "past_plural", "participle", "auxiliary"]:
            answered, seen = self.play(client, mode, size=3)
            assert answered == 3, mode
            assert seen == {mode}

    def test_all_forms_cycles_through_the_columns(self, client):
        answered, seen = self.play(client, "all_forms", size=3)
        assert answered == 12          # 3 verbs x 4 forms
        assert seen == {"past_singular", "past_plural", "participle", "auxiliary"}

    def test_a_wrong_answer_returns_the_whole_row(self, client):
        start = client.post("/api/verbs/game/start",
                            json={"mode": "participle", "session_size": 1})
        sid = start.json()["session_id"]
        q = client.get("/api/verbs/game/next", params={"session_id": sid}).json()
        a = client.post("/api/verbs/game/answer", json={
            "session_id": sid, "verb_id": q["verb_id"], "mode": q["mode"],
            "answer": "wrong", "time_ms": 900}).json()
        assert a["correct"] is False
        assert a["expected"]
        # Seeing the full pattern is how you learn it, not just the missing cell.
        assert {"infinitive", "past_singular", "past_plural",
                "participle", "auxiliary"} <= set(a["verb"])

    def test_auxiliary_mode_offers_choices(self, client):
        start = client.post("/api/verbs/game/start",
                            json={"mode": "auxiliary", "session_size": 1})
        sid = start.json()["session_id"]
        q = client.get("/api/verbs/game/next", params={"session_id": sid}).json()
        assert q["options"] == ["hebben", "zijn", "hebben/zijn"]

    def test_typed_modes_offer_no_choices(self, client):
        start = client.post("/api/verbs/game/start",
                            json={"mode": "participle", "session_size": 1})
        sid = start.json()["session_id"]
        q = client.get("/api/verbs/game/next", params={"session_id": sid}).json()
        assert q["options"] is None

    def test_answers_are_case_and_space_insensitive(self, client):
        start = client.post("/api/verbs/game/start",
                            json={"mode": "participle", "session_size": 1})
        sid = start.json()["session_id"]
        q = client.get("/api/verbs/game/next", params={"session_id": sid}).json()
        verb = next(v for v in client.get("/api/verbs/").json() if v["id"] == q["verb_id"])
        a = client.post("/api/verbs/game/answer", json={
            "session_id": sid, "verb_id": q["verb_id"], "mode": q["mode"],
            "answer": f"  {verb['participle'].upper()}  ", "time_ms": 900}).json()
        assert a["correct"] is True

    def test_progress_is_recorded_per_mode(self, client, db):
        """Each column is scheduled on its own, so a row exists per (verb, mode)."""
        client.post("/api/verbs/reset")
        self.play(client, "participle", size=2)
        rows = db.execute("SELECT DISTINCT mode FROM verb_progress").fetchall()
        assert [r["mode"] for r in rows] == ["participle"]

        self.play(client, "auxiliary", size=2)
        rows = db.execute("SELECT DISTINCT mode FROM verb_progress ORDER BY mode").fetchall()
        assert [r["mode"] for r in rows] == ["auxiliary", "participle"]

    def test_reset_clears_only_this_account(self, client, other_client, db):
        self.play(client, "participle", size=2)
        assert db.execute("SELECT COUNT(*) AS n FROM verb_progress").fetchone()["n"] > 0
        assert client.post("/api/verbs/reset").status_code == 204
        assert db.execute("SELECT COUNT(*) AS n FROM verb_progress").fetchone()["n"] == 0

    def test_another_account_cannot_use_the_session(self, client, other_client):
        start = client.post("/api/verbs/game/start",
                            json={"mode": "participle", "session_size": 2})
        sid = start.json()["session_id"]
        assert other_client.get("/api/verbs/game/next",
                                params={"session_id": sid}).status_code == 404

    def test_verb_progress_is_per_account(self, client, other_client):
        self.play(client, "participle", size=2)
        mine = client.get("/api/verbs/summary").json()
        theirs = other_client.get("/api/verbs/summary").json()
        practised = {m["mode"]: m["practised"] for m in mine["modes"]}
        theirs_practised = {m["mode"]: m["practised"] for m in theirs["modes"]}
        assert practised["participle"] > 0
        assert theirs_practised["participle"] == 0
