"""Startup seeding.

seed_builtin_lists() runs on every boot, so it has to converge: repeated runs
must not keep adding rows, and it must not re-issue a query per word.
"""
import database
from conftest import reset_database


def count_words(conn):
    return conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]


def test_seeding_is_idempotent():
    """Regression: lists shipping both "fout" and "de fout" made the count drift.

    The bare-noun upgrade consumed "fout" as the old row for "de fout", so the
    next boot reinserted it and the word count grew.
    """
    reset_database()
    conn = database.get_db()
    first = count_words(conn)
    conn.close()

    for _ in range(3):
        database.seed_builtin_lists()
        conn = database.get_db()
        assert count_words(conn) == first, "seeding added rows on a repeat run"
        conn.close()


def test_both_forms_survive_when_the_corpus_ships_both():
    reset_database()
    conn = database.get_db()
    rows = conn.execute(
        "SELECT source_word FROM words WHERE source_word IN ('fout', 'de fout')"
    ).fetchall()
    conn.close()
    assert {r["source_word"] for r in rows} == {"fout", "de fout"}


def test_bare_noun_is_upgraded_in_place():
    """A word stored bare by an older version gains its article without duplicating."""
    reset_database()
    conn = database.get_db()
    row = conn.execute(
        "SELECT id, list_id, source_word, target_word FROM words "
        "WHERE source_word LIKE 'de %' LIMIT 1").fetchone()
    word_id, list_id = row["id"], row["list_id"]
    full, target = row["source_word"], row["target_word"]
    bare = full.split(" ", 1)[1]

    conn.execute("UPDATE words SET source_word = ?, target_word = ? WHERE id = ?",
                 (bare, "STALE", word_id))
    conn.commit()
    before = count_words(conn)
    conn.close()

    database.seed_builtin_lists()

    conn = database.get_db()
    after = count_words(conn)
    upgraded = conn.execute(
        "SELECT source_word, target_word FROM words WHERE id = ?", (word_id,)).fetchone()
    leftover = conn.execute(
        "SELECT COUNT(*) FROM words WHERE list_id = ? AND source_word = ?",
        (list_id, bare)).fetchone()[0]
    conn.close()

    assert upgraded["source_word"] == full
    assert upgraded["target_word"] == target
    assert after == before, "the upgrade inserted a duplicate instead of renaming"
    assert leftover == 0


def test_seeding_stays_within_a_few_round_trips():
    """Per-word queries are invisible on a local file and minutes over a network."""
    reset_database()
    real_get_db = database.get_db
    queries = {"n": 0}

    class Counting:
        def __init__(self, inner):
            self._inner = inner

        def execute(self, *a, **k):
            queries["n"] += 1
            return self._inner.execute(*a, **k)

        def executemany(self, *a, **k):
            queries["n"] += 1
            return self._inner.executemany(*a, **k)

        def __getattr__(self, name):
            return getattr(self._inner, name)

    database.get_db = lambda: Counting(real_get_db())
    try:
        database.seed_builtin_lists()
    finally:
        database.get_db = real_get_db

    assert queries["n"] < 30, f"seeding issued {queries['n']} queries; expected a handful"
