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


class TestFixedPrepositions:
    """A Dutch verb's fixed preposition is not optional, so it is part of the entry.

    Storing "wachten" alone teaches half the word: the learner still has to
    guess between op, aan, voor and naar. Practising "wachten op" drills the
    preposition along with the verb, and the typing mode will not accept the
    verb without it.
    """

    CATEGORY = "🇳🇱 Dutch A2 — Verbs with Fixed Prepositions"
    PREPOSITIONS = {"op", "aan", "van", "voor", "met", "over",
                    "naar", "in", "bij", "uit", "om", "tot"}

    def category(self):
        return next(i for i in BUILTIN_LISTS if i["name"] == self.CATEGORY)

    def test_category_exists_and_is_substantial(self):
        assert len(self.category()["words"]) >= 90

    def test_every_entry_carries_its_preposition_or_zich(self):
        for source, _ in self.category()["words"]:
            trailing = source.split()[-1]
            assert trailing in self.PREPOSITIONS or source.startswith("zich"), source

    def test_the_expected_verbs_are_present_with_the_right_preposition(self):
        entries = dict(self.category()["words"])
        for phrase in [
            "verliefd zijn op", "zich verheugen op", "wachten op", "denken aan",
            "houden van", "luisteren naar", "bang zijn voor", "trots zijn op",
            "zich zorgen maken over", "bestaan uit", "deelnemen aan",
            "geïnteresseerd zijn in", "horen bij", "beginnen met",
        ]:
            assert phrase in entries, f"missing {phrase}"

    def test_a_bare_verb_and_its_prepositional_form_can_coexist(self):
        """They are different lexical items and both are worth knowing."""
        every = {w for i in BUILTIN_LISTS for w, _ in i["words"]}
        assert "wachten" in every and "wachten op" in every
        assert "denken" in every and "denken aan" in every

    def test_reflexive_verbs_keep_zich(self):
        entries = dict(self.category()["words"])
        for phrase in ["zich verheugen op", "zich schamen voor", "zich ergeren aan"]:
            assert phrase in entries


class TestGapsAreFilled:
    """Basic connectives and phrases a first course covers were absent."""

    def test_core_conjunctions_present(self):
        every = {w for i in BUILTIN_LISTS for w, _ in i["words"]}
        for word in ["omdat", "want", "hoewel", "terwijl", "zodat",
                     "voordat", "nadat", "tenzij", "zodra", "totdat"]:
            assert word in every, f"missing conjunction {word}"

    def test_core_adverbs_present(self):
        every = {w for i in BUILTIN_LISTS for w, _ in i["words"]}
        for word in ["waarschijnlijk", "meteen", "helemaal", "vooral",
                     "zelfs", "nogal", "bijna", "eindelijk"]:
            assert word in every, f"missing adverb {word}"

    def test_everyday_phrases_present(self):
        every = {w for i in BUILTIN_LISTS for w, _ in i["words"]}
        for phrase in ["Tot ziens", "Het spijt me", "Geen probleem",
                       "Ik begrijp het niet", "Kunt u dat herhalen"]:
            assert phrase in every, f"missing phrase {phrase}"


class TestNounArticles:
    """A Dutch noun without its article is half-learned.

    "de" or "het" is not decoration — it governs adjective endings and relative
    pronouns, and there is no rule that predicts it, so it has to be memorised
    with the word.
    """

    # Entries whose English gloss opens with "the" but which are not nouns
    # taking an article: the articles themselves, adverbs of time, a pronoun,
    # and a country name.
    NOT_ARTICLE_NOUNS = {"de", "het", "eergisteren", "overmorgen",
                         "hetzelfde", "Nederland"}

    # A bare form and an article form of the same spelling, where they are
    # genuinely different words rather than a duplicate.
    HOMONYMS = {"dag", "haar", "recht", "eten", "zout", "bij", "boeken",
                "Nederlands", "fout", "Duits", "Engels", "Frans", "Pools",
                "Turks", "weer",
                # A verb or adjective beside its nominalised form:
                # "duur" (expensive) vs "de duur" (the duration).
                "duur", "overlijden", "vermoeden", "vertrouwen"}

    def entries(self):
        return {s: t for i in BUILTIN_LISTS for s, t in i["words"]}

    def test_every_noun_carries_de_or_het(self):
        for source, target in self.entries().items():
            if not target.lower().startswith("the "):
                continue
            if source in self.NOT_ARTICLE_NOUNS:
                continue
            assert source.startswith(("de ", "het ")), f"{source!r} ({target}) has no article"

    def test_no_noun_is_stored_both_with_and_without_its_article(self):
        entries = self.entries()
        for source in entries:
            for article in ("de ", "het "):
                if article + source in entries:
                    assert source in self.HOMONYMS, (
                        f"{source!r} duplicates {article + source!r}")

    def test_homonyms_say_which_is_which(self):
        """Otherwise the pair looks like an inconsistency rather than two words."""
        entries = self.entries()
        for bare in self.HOMONYMS:
            if bare not in entries:
                continue
            gloss = entries[bare]
            assert "(" in gloss, (
                f"{bare!r} sits beside its article form but its gloss {gloss!r} "
                "does not distinguish them")

    def test_known_het_words_are_not_filed_under_de(self):
        words = set(self.entries())
        for noun in ["huis", "kind", "boek", "water", "brood", "meisje", "jaar",
                     "geld", "werk", "land", "bed", "glas", "oog", "hoofd",
                     "been", "gezicht", "station", "ziekenhuis", "museum"]:
            assert f"de {noun}" not in words, f"'de {noun}' should be 'het {noun}'"

    def test_known_de_words_are_not_filed_under_het(self):
        words = set(self.entries())
        for noun in ["man", "vrouw", "fiets", "auto", "tafel", "stoel", "deur",
                     "hand", "voet", "arm", "rug", "stad", "straat", "school",
                     "winkel", "trein", "bus", "hond", "kat"]:
            assert f"het {noun}" not in words, f"'het {noun}' should be 'de {noun}'"
