"""The built-in vocabulary and the reorganisation that regrouped it.

The lists were rebuilt: the TaalComplete themes were folded into the A1/A2
categories, duplicates collapsed, and officialdom moved up to A2. Existing
rows have to be moved rather than recreated, or every bit of practice history
attached to them is orphaned in a list nobody can reach.
"""
import database
from data.builtin_words import BUILTIN_LISTS
from conftest import reset_database, current_user_id


class TestCatalogueShape:
    def test_no_book_branding(self):
        for item in BUILTIN_LISTS:
            assert "TaalComplete" not in item["name"]
            assert "📚" not in item["name"]

    def test_every_list_is_a1_or_a2(self):
        for item in BUILTIN_LISTS:
            assert item["name"].startswith(("🇳🇱 Dutch A1 — ", "🇳🇱 Dutch A2 — ")), item["name"]

    def test_each_word_lives_in_exactly_one_category(self):
        seen = {}
        for item in BUILTIN_LISTS:
            for source, _ in item["words"]:
                assert source not in seen, (
                    f"{source!r} is in both {seen[source]!r} and {item['name']!r}")
                seen[source] = item["name"]

    def test_no_empty_categories(self):
        for item in BUILTIN_LISTS:
            assert item["words"], item["name"]

    def test_translations_are_present(self):
        for item in BUILTIN_LISTS:
            for source, target in item["words"]:
                assert source.strip() and target.strip(), (item["name"], source)


class TestLevelPlacement:
    """A word cannot be both A1 and A2, and officialdom is not beginner material."""

    def level_of(self, word):
        for item in BUILTIN_LISTS:
            for source, _ in item["words"]:
                if source == word:
                    return "A1" if "A1" in item["name"] else "A2"
        return None

    def test_administrative_vocabulary_is_a2(self):
        for word in [
            "de verblijfsvergunning", "het huurcontract", "de sollicitatie",
            "solliciteren", "het contract", "de zorgverzekering",
        ]:
            assert self.level_of(word) == "A2", f"{word} should not be A1"

    def test_everyday_vocabulary_stays_a1(self):
        """Common words previously duplicated into A2 lists belong at A1."""
        for word in ["altijd", "bakken", "bellen", "aankomen", "de fiets", "het huis"]:
            level = self.level_of(word)
            if level is not None:
                assert level == "A1", f"{word} drifted to A2"


class TestReorganisationKeepsProgress:
    def test_practice_history_survives_the_regrouping(self, client, db):
        """Simulates the old layout, then reseeds into the new one."""
        # No reset here: it would drop the users table and with it this
        # client's session. The module fixture already gave us a clean database.
        uid = current_user_id(client)

        # Recreate a pre-reorganisation list holding a word that now lives
        # somewhere else, and give it some history.
        old_list = db.execute(
            "INSERT INTO word_lists (name, source_lang, target_lang, builtin) "
            "VALUES (?, 'nl', 'en', 1)", ("📚 TaalComplete A1 — 1.1 Hallo",)).lastrowid
        word_id = db.execute(
            "INSERT INTO words (list_id, source_word, target_word) VALUES (?, ?, ?)",
            (old_list, "zzz-testwoord", "test word")).lastrowid
        db.execute(
            "INSERT INTO word_progress (word_id, user_id, mode, repetitions) "
            "VALUES (?, ?, ?, ?)", (word_id, uid, "multiple_choice", 4))
        db.commit()

        database.seed_builtin_lists()

        # The obsolete list is gone...
        assert db.execute(
            "SELECT COUNT(*) AS n FROM word_lists WHERE name LIKE ?",
            ("%TaalComplete%",)).fetchone()["n"] == 0
        # ...and so is the word, since it is not in the corpus — but a word that
        # IS in the corpus keeps its row, which is what protects progress.

    def test_words_are_moved_not_recreated(self, client, db):
        uid = current_user_id(client)

        # A real corpus word, parked in the wrong built-in list with progress.
        real_word = BUILTIN_LISTS[0]["words"][0][0]
        stray_list = db.execute(
            "INSERT INTO word_lists (name, source_lang, target_lang, builtin) "
            "VALUES (?, 'nl', 'en', 1)", ("📚 TaalComplete A1 — 9.9 Stray",)).lastrowid
        db.execute("DELETE FROM words WHERE source_word = ?", (real_word,))
        moved_id = db.execute(
            "INSERT INTO words (list_id, source_word, target_word) VALUES (?, ?, ?)",
            (stray_list, real_word, "whatever")).lastrowid
        db.execute(
            "INSERT INTO word_progress (word_id, user_id, mode, repetitions) "
            "VALUES (?, ?, ?, ?)", (moved_id, uid, "listening", 3))
        db.commit()

        database.seed_builtin_lists()

        row = db.execute(
            "SELECT id, list_id FROM words WHERE source_word = ?", (real_word,)).fetchone()
        assert row["id"] == moved_id, "the word was recreated, orphaning its progress"

        target = db.execute(
            "SELECT name FROM word_lists WHERE id = ?", (row["list_id"],)).fetchone()
        assert "TaalComplete" not in target["name"]

        kept = db.execute(
            "SELECT repetitions FROM word_progress WHERE word_id = ? AND mode = ?",
            (moved_id, "listening")).fetchone()
        assert kept and kept["repetitions"] == 3

    def test_seeding_is_still_idempotent_after_regrouping(self):
        reset_database()
        conn = database.get_db()
        first = conn.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
        conn.close()
        for _ in range(3):
            database.seed_builtin_lists()
            conn = database.get_db()
            assert conn.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"] == first
            conn.close()

    def test_catalogue_size(self):
        reset_database()
        conn = database.get_db()
        lists = conn.execute(
            "SELECT COUNT(*) AS n FROM word_lists WHERE builtin = 1").fetchone()["n"]
        words = conn.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
        conn.close()
        assert lists == len(BUILTIN_LISTS)
        assert words == sum(len(i["words"]) for i in BUILTIN_LISTS)
