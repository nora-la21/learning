import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "learning.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS word_lists (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
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

        CREATE TABLE IF NOT EXISTS answer_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
            mode        TEXT NOT NULL,
            correct     INTEGER NOT NULL,
            time_ms     INTEGER,
            answered_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    conn.close()


def seed_builtin_lists() -> None:
    from data.builtin_words import BUILTIN_LISTS

    conn = get_db()

    # Remove old monolithic A1/A2 lists replaced by categorized ones
    for old_name in ("🇳🇱 Dutch A1 — Basic Vocabulary", "🇳🇱 Dutch A2 — Elementary Vocabulary"):
        conn.execute("DELETE FROM word_lists WHERE name = ? AND builtin = 1", (old_name,))

    for item in BUILTIN_LISTS:
        name: str = item["name"]
        words: list = item["words"]

        row = conn.execute("SELECT id FROM word_lists WHERE name = ? AND builtin = 1", (name,)).fetchone()
        if row:
            list_id = row["id"]
        else:
            cursor = conn.execute(
                "INSERT INTO word_lists (name, source_lang, target_lang, builtin) VALUES (?, 'nl', 'en', 1)",
                (name,),
            )
            list_id = cursor.lastrowid

        for src, tgt in words:
            exists = conn.execute(
                "SELECT id FROM words WHERE list_id=? AND source_word=?", (list_id, src)
            ).fetchone()
            if exists:
                continue
            bare = src.split(' ', 1)[1] if src.startswith(('de ', 'het ')) else None
            if bare:
                old = conn.execute(
                    "SELECT id FROM words WHERE list_id=? AND source_word=?", (list_id, bare)
                ).fetchone()
                if old:
                    conn.execute("UPDATE words SET source_word=?, target_word=? WHERE id=?", (src, tgt, old["id"]))
                    continue
            conn.execute(
                "INSERT OR IGNORE INTO words (list_id, source_word, target_word) VALUES (?, ?, ?)",
                (list_id, src, tgt),
            )

    conn.commit()
    conn.close()
