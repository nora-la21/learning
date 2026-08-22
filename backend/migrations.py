"""Schema migrations for databases created before accounts existed.

CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so a
live database needs its new columns added explicitly. This runs on every boot
and does nothing once applied.

The delicate part is word_progress. It was UNIQUE(word_id, mode), which is
correct for one user and wrong for several — the second person to practise a
word would collide with the first. Postgres can swap a constraint in place;
SQLite cannot, so the table is rebuilt.
"""
from database import USE_POSTGRES

# Ownership added to data that predates accounts. All nullable: existing rows
# have no owner until the first account claims them.
OWNERSHIP_COLUMNS = [
    ("word_lists", "user_id"),          # NULL also means a shared built-in list
    ("word_progress", "user_id"),
    ("answer_events", "user_id"),
    ("push_subscriptions", "user_id"),
    ("game_sessions", "user_id"),
]

WORD_PROGRESS_INDEX = "ux_word_progress_user_word_mode"


def _has_column(conn, table: str, column: str) -> bool:
    if USE_POSTGRES:
        row = conn.execute(
            "SELECT 1 AS present FROM information_schema.columns "
            "WHERE table_name = ? AND column_name = ?", (table, column)).fetchone()
        return bool(row)
    return column in {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _table_exists(conn, table: str) -> bool:
    if USE_POSTGRES:
        return bool(conn.execute(
            "SELECT 1 AS present FROM information_schema.tables WHERE table_name = ?",
            (table,)).fetchone())
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (table,)).fetchone())


def run(conn) -> None:
    for table, column in OWNERSHIP_COLUMNS:
        if not _table_exists(conn, table) or _has_column(conn, table, column):
            continue
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} INTEGER")
        conn.commit()

    _fix_word_progress_uniqueness(conn)
    conn.commit()


def _fix_word_progress_uniqueness(conn) -> None:
    if not _table_exists(conn, "word_progress"):
        return
    if USE_POSTGRES:
        _fix_word_progress_uniqueness_postgres(conn)
    else:
        _fix_word_progress_uniqueness_sqlite(conn)


def _fix_word_progress_uniqueness_postgres(conn) -> None:
    stale = conn.execute(
        "SELECT conname FROM pg_constraint "
        "WHERE conrelid = 'word_progress'::regclass AND contype = 'u'"
    ).fetchall()
    for row in stale:
        name = row["conname"]
        if name == WORD_PROGRESS_INDEX:
            continue
        conn.execute(f'ALTER TABLE word_progress DROP CONSTRAINT IF EXISTS "{name}"')
    conn.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {WORD_PROGRESS_INDEX} "
        "ON word_progress (user_id, word_id, mode)"
    )
    conn.commit()


def _normalised(sql: str) -> str:
    return "".join(sql.split()).lower()


def _fix_word_progress_uniqueness_sqlite(conn) -> None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='word_progress'"
    ).fetchone()
    if not row or not row[0]:
        return
    definition = _normalised(row[0])
    if "unique(user_id,word_id,mode)" in definition:
        return
    if "unique(word_id,mode)" not in definition:
        # Already constraint-free; a plain index is enough.
        conn.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS {WORD_PROGRESS_INDEX} "
            "ON word_progress (user_id, word_id, mode)")
        conn.commit()
        return

    # SQLite cannot alter a constraint, so copy the data into a corrected table.
    conn.executescript("""
        CREATE TABLE word_progress_migrated (
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
        INSERT INTO word_progress_migrated
            (id, word_id, user_id, mode, repetitions, ease_factor, interval_days,
             next_review_at, correct_count, incorrect_count, last_seen_at, mastered)
        SELECT id, word_id, user_id, mode, repetitions, ease_factor, interval_days,
               next_review_at, correct_count, incorrect_count, last_seen_at, mastered
        FROM word_progress;
        DROP TABLE word_progress;
        ALTER TABLE word_progress_migrated RENAME TO word_progress;
    """)
    conn.commit()
