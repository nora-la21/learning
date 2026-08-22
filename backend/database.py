import os
import sqlite3
from pathlib import Path

# Set DATABASE_URL (e.g. a Supabase Postgres connection string) to use Postgres.
# Without it the app falls back to a local SQLite file so `uvicorn main:app`
# works with no external services.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = bool(DATABASE_URL)

DB_PATH = Path(os.environ.get("DB_PATH", str(Path.home() / ".dutch_vocab" / "learning.db")))
if not USE_POSTGRES:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_db():
    if USE_POSTGRES:
        from db_postgres import Connection
        return Connection(DATABASE_URL)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    if USE_POSTGRES:
        from db_postgres import SCHEMA
        import migrations
        conn = get_db()
        conn.executescript(SCHEMA)
        migrations.run(conn)
        conn.close()
        return

    DB_PATH.parent.mkdir(exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS word_lists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER,
            name        TEXT NOT NULL,
            source_lang TEXT NOT NULL DEFAULT 'nl',
            target_lang TEXT NOT NULL DEFAULT 'en',
            source_file TEXT,
            builtin     INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS words (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id           INTEGER NOT NULL REFERENCES word_lists(id) ON DELETE CASCADE,
            source_word       TEXT NOT NULL,
            target_word       TEXT NOT NULL,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            manually_excluded INTEGER NOT NULL DEFAULT 0,
            UNIQUE(list_id, source_word)
        );

        CREATE TABLE IF NOT EXISTS word_progress (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
            user_id         INTEGER,
            mode            TEXT NOT NULL,
            repetitions     INTEGER NOT NULL DEFAULT 0,
            ease_factor     REAL NOT NULL DEFAULT 2.5,
            interval_days   INTEGER NOT NULL DEFAULT 1,
            next_review_at  TEXT NOT NULL DEFAULT (datetime('now')),
            correct_count   INTEGER NOT NULL DEFAULT 0,
            incorrect_count INTEGER NOT NULL DEFAULT 0,
            last_seen_at    TEXT,
            mastered        INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, word_id, mode)
        );

        CREATE TABLE IF NOT EXISTS answer_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
            user_id     INTEGER,
            mode        TEXT NOT NULL,
            correct     INTEGER NOT NULL,
            time_ms     INTEGER,
            answered_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS irregular_verbs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            infinitive    TEXT NOT NULL UNIQUE,
            past_singular TEXT NOT NULL,
            past_plural   TEXT NOT NULL,
            participle    TEXT NOT NULL,
            auxiliary     TEXT NOT NULL,
            meaning       TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verb_progress (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL,
            verb_id         INTEGER NOT NULL REFERENCES irregular_verbs(id) ON DELETE CASCADE,
            mode            TEXT NOT NULL,
            repetitions     INTEGER NOT NULL DEFAULT 0,
            ease_factor     REAL NOT NULL DEFAULT 2.5,
            interval_days   INTEGER NOT NULL DEFAULT 1,
            next_review_at  TEXT NOT NULL DEFAULT (datetime('now')),
            correct_count   INTEGER NOT NULL DEFAULT 0,
            incorrect_count INTEGER NOT NULL DEFAULT 0,
            last_seen_at    TEXT,
            mastered        INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, verb_id, mode)
        );

        CREATE TABLE IF NOT EXISTS user_word_flags (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
            known   INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, word_id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            endpoint   TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS game_sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER,
            session_id TEXT NOT NULL UNIQUE,
            data       TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    # Simple column-add migrations (safe to retry)
    for migration in [
        "ALTER TABLE word_lists ADD COLUMN builtin INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE words ADD COLUMN manually_excluded INTEGER NOT NULL DEFAULT 0",
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except Exception:
            pass

    # Remove CHECK constraint on answer_events.mode if present (blocks new modes)
    table_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='answer_events'"
    ).fetchone()
    if table_row and table_row[0] and 'CHECK' in table_row[0].upper():
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS answer_events_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
                mode        TEXT NOT NULL,
                correct     INTEGER NOT NULL,
                time_ms     INTEGER,
                answered_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO answer_events_new SELECT * FROM answer_events;
            DROP TABLE answer_events;
            ALTER TABLE answer_events_new RENAME TO answer_events;
        """)
        conn.commit()

    # Migrate word_progress to per-(word, mode) schema if it lacks the mode column
    wp_cols = [r[1] for r in conn.execute("PRAGMA table_info(word_progress)").fetchall()]
    if wp_cols and 'mode' not in wp_cols:
        # Save manually_excluded flags before dropping
        try:
            conn.execute(
                "UPDATE words SET manually_excluded = 1 "
                "WHERE id IN (SELECT word_id FROM word_progress WHERE manually_excluded = 1)"
            )
            conn.commit()
        except Exception:
            pass
        conn.executescript("""
            DROP TABLE word_progress;
            CREATE TABLE word_progress (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                word_id         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
                mode            TEXT NOT NULL,
                repetitions     INTEGER NOT NULL DEFAULT 0,
                ease_factor     REAL NOT NULL DEFAULT 2.5,
                interval_days   INTEGER NOT NULL DEFAULT 1,
                next_review_at  TEXT NOT NULL DEFAULT (datetime('now')),
                correct_count   INTEGER NOT NULL DEFAULT 0,
                incorrect_count INTEGER NOT NULL DEFAULT 0,
                last_seen_at    TEXT,
                mastered        INTEGER NOT NULL DEFAULT 0,
                UNIQUE(word_id, mode)
            );
        """)
        conn.commit()

    import migrations
    migrations.run(conn)

    conn.close()


def seed_builtin_lists() -> None:
    """Idempotent seed, batched into a handful of round trips.

    Runs on every boot, so it reads the whole builtin corpus up front and
    writes only the delta. Per-word queries would be ~4k round trips, which is
    imperceptible on a local SQLite file but minutes against a remote Postgres.
    """
    from data.builtin_words import BUILTIN_LISTS

    conn = get_db()

    # Remove old monolithic A1/A2 lists replaced by categorized ones
    for old_name in ("🇳🇱 Dutch A1 — Basic Vocabulary", "🇳🇱 Dutch A2 — Elementary Vocabulary"):
        conn.execute("DELETE FROM word_lists WHERE name = ? AND builtin = 1", (old_name,))

    # 1. Resolve every builtin list id in one read, then create only the missing ones.
    existing_lists = {
        r["name"]: r["id"]
        for r in conn.execute("SELECT id, name FROM word_lists WHERE builtin = 1").fetchall()
    }
    list_ids: dict[str, int] = {}
    for item in BUILTIN_LISTS:
        name = item["name"]
        if name in existing_lists:
            list_ids[name] = existing_lists[name]
        else:
            cursor = conn.execute(
                "INSERT INTO word_lists (name, source_lang, target_lang, builtin) VALUES (?, 'nl', 'en', 1)",
                (name,),
            )
            list_ids[name] = cursor.lastrowid

    if not list_ids:
        conn.commit()
        conn.close()
        return

    # 1b. Re-home words whose category changed.
    #     The built-in lists were reorganised, so a word that already exists is
    #     usually sitting under its old list. Moving the row keeps its id, and
    #     with it every bit of practice history; letting the insert below create
    #     a fresh row instead would silently orphan all of that progress.
    _rehome_builtin_words(conn, list_ids, BUILTIN_LISTS)

    # 2. Read every existing word for those lists in one query.
    ids = list(list_ids.values())
    ph = ','.join('?' * len(ids))
    existing: dict[tuple[int, str], int] = {}
    for r in conn.execute(
        f"SELECT id, list_id, source_word FROM words WHERE list_id IN ({ph})", tuple(ids)
    ).fetchall():
        existing[(r["list_id"], r["source_word"])] = r["id"]

    # 3. Diff in memory. A bare noun left over from an older version of the app is
    #    upgraded in place to its article form ("hond" -> "de hond") instead of
    #    being left behind as a duplicate. That upgrade must not fire when the bare
    #    form is itself a corpus entry for the list: 2.8 Cijfers legitimately ships
    #    both "fout" (wrong) and "de fout" (the mistake) as distinct words.
    corpus_words = {
        list_ids[item["name"]]: {src for src, _ in item["words"]}
        for item in BUILTIN_LISTS
    }
    renames: list[tuple[str, str, int]] = []
    inserts: list[tuple[int, str, str]] = []
    planned: set[tuple[int, str]] = set()
    for item in BUILTIN_LISTS:
        list_id = list_ids[item["name"]]
        for src, tgt in item["words"]:
            if (list_id, src) in existing or (list_id, src) in planned:
                continue
            bare = src.split(' ', 1)[1] if src.startswith(('de ', 'het ')) else None
            if bare and bare not in corpus_words[list_id] and (list_id, bare) in existing:
                old_id = existing.pop((list_id, bare))
                renames.append((src, tgt, old_id))
                existing[(list_id, src)] = old_id
                continue
            inserts.append((list_id, src, tgt))
            planned.add((list_id, src))

    # 4. Two batched writes.
    if renames:
        conn.executemany("UPDATE words SET source_word=?, target_word=? WHERE id=?", renames)
    if inserts:
        conn.executemany(
            "INSERT OR IGNORE INTO words (list_id, source_word, target_word) VALUES (?, ?, ?)",
            inserts,
        )

    conn.commit()
    conn.close()


def _rehome_builtin_words(conn, list_ids: dict, corpus) -> None:
    """Move existing built-in words into their new category.

    Words are identified by (list_id, source_word), so a reorganisation would
    otherwise insert duplicates and leave the originals — along with their
    practice history — stranded in lists the user can no longer see.

    Where the same word ends up in two rows, the one carrying progress wins;
    the reorganisation merged categories that previously overlapped, so those
    collisions are expected rather than exceptional.
    """
    target_of = {}
    bare_forms = set()
    for item in corpus:
        list_id = list_ids.get(item["name"])
        if list_id is None:
            continue
        for source, _ in item["words"]:
            target_of[source] = list_id
            # An older database may hold "hond" where the corpus now says
            # "de hond". Those rows are upgraded in place further down, so they
            # must survive this pass rather than being deleted as unknown.
            if source.startswith(("de ", "het ")):
                bare_forms.add(source.split(" ", 1)[1])

    rows = conn.execute(
        "SELECT w.id, w.list_id, w.source_word FROM words w "
        "JOIN word_lists wl ON wl.id = w.list_id WHERE wl.builtin = 1"
    ).fetchall()
    if not rows:
        return

    def has_progress(word_id: int) -> bool:
        return bool(conn.execute(
            "SELECT 1 AS present FROM word_progress WHERE word_id = ? LIMIT 1", (word_id,)
        ).fetchone())

    occupant: dict[tuple, int] = {}
    for row in rows:
        if row["list_id"] == target_of.get(row["source_word"]):
            occupant[(row["list_id"], row["source_word"])] = row["id"]

    for row in rows:
        target = target_of.get(row["source_word"])
        if target is None:
            if row["source_word"] in bare_forms:
                continue    # left for the article upgrade
            # Dropped from the built-in corpus entirely.
            conn.execute("DELETE FROM words WHERE id = ?", (row["id"],))
            continue
        if row["list_id"] == target:
            continue

        key = (target, row["source_word"])
        sitting = occupant.get(key)
        if sitting is None:
            conn.execute("UPDATE words SET list_id = ? WHERE id = ?", (target, row["id"]))
            occupant[key] = row["id"]
        elif has_progress(row["id"]) and not has_progress(sitting):
            # The row being moved is the one worth keeping.
            conn.execute("DELETE FROM words WHERE id = ?", (sitting,))
            conn.execute("UPDATE words SET list_id = ? WHERE id = ?", (target, row["id"]))
            occupant[key] = row["id"]
        else:
            conn.execute("DELETE FROM words WHERE id = ?", (row["id"],))

    # Built-in lists that no longer exist in the corpus.
    keep = set(list_ids.values())
    for stale in conn.execute(
        "SELECT id FROM word_lists WHERE builtin = 1"
    ).fetchall():
        if stale["id"] not in keep:
            conn.execute("DELETE FROM word_lists WHERE id = ?", (stale["id"],))
    conn.commit()


def seed_irregular_verbs() -> None:
    """Load the strong-verb table. Idempotent, and updates rows that changed."""
    from data.irregular_verbs import IRREGULAR_VERBS

    conn = get_db()
    try:
        existing = {
            r["infinitive"]: r
            for r in conn.execute(
                "SELECT id, infinitive, past_singular, past_plural, participle, "
                "auxiliary, meaning FROM irregular_verbs"
            ).fetchall()
        }
        inserts, updates = [], []
        for inf, sg, pl, part, aux, meaning in IRREGULAR_VERBS:
            row = existing.get(inf)
            if row is None:
                inserts.append((inf, sg, pl, part, aux, meaning))
            elif (row["past_singular"], row["past_plural"], row["participle"],
                  row["auxiliary"], row["meaning"]) != (sg, pl, part, aux, meaning):
                # Corrections to the table must reach people who already have it,
                # and updating in place keeps their practice history attached.
                updates.append((sg, pl, part, aux, meaning, row["id"]))

        if inserts:
            conn.executemany(
                "INSERT OR IGNORE INTO irregular_verbs "
                "(infinitive, past_singular, past_plural, participle, auxiliary, meaning) "
                "VALUES (?, ?, ?, ?, ?, ?)", inserts)
        if updates:
            conn.executemany(
                "UPDATE irregular_verbs SET past_singular = ?, past_plural = ?, "
                "participle = ?, auxiliary = ?, meaning = ? WHERE id = ?", updates)

        wanted = {v[0] for v in IRREGULAR_VERBS}
        for inf in existing:
            if inf not in wanted:
                conn.execute("DELETE FROM irregular_verbs WHERE infinitive = ?", (inf,))
        conn.commit()
    finally:
        conn.close()
