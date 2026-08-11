"""Postgres backend exposing a sqlite3-compatible connection interface.

The app was written against sqlite3. Rather than rewrite ~60 call sites, this
module adapts psycopg to the same surface: `?` placeholders, `execute()`
returning a cursor, rows indexable by name or position, and `lastrowid`.
"""
import re
from datetime import date, datetime

import psycopg
from psycopg.rows import dict_row

# SQLite date helpers have no direct Postgres equivalent.
_DATETIME_OFFSET = re.compile(r"datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(\w+)'\s*\)", re.I)
_DATETIME_NOW = re.compile(r"datetime\(\s*'now'\s*\)", re.I)
_DATE_FN = re.compile(r"\bDATE\(\s*(\w+)\s*\)", re.I)


_INSERT_OR_IGNORE = re.compile(r"INSERT\s+OR\s+IGNORE\s+INTO", re.I)


def translate(sql: str) -> str:
    # The captured sign stays in the interval, so '-7 days' must be ADDED:
    # NOW() - INTERVAL '-7 days' would resolve seven days into the future.
    sql = _DATETIME_OFFSET.sub(r"(NOW() + INTERVAL '\1 \2')", sql)
    sql = _DATETIME_NOW.sub("NOW()", sql)
    sql = _DATE_FN.sub(r"TO_CHAR(\1, 'YYYY-MM-DD')", sql)
    if _INSERT_OR_IGNORE.search(sql):
        sql = _INSERT_OR_IGNORE.sub("INSERT INTO", sql).rstrip().rstrip(";")
        sql += " ON CONFLICT DO NOTHING"
    return sql.replace("?", "%s")


class Row(dict):
    """Row addressable by column name (dict) or ordinal (sqlite3.Row)."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def _as_text(value):
    """Present temporal columns the way SQLite did.

    SQLite held these as TEXT, so the Pydantic response models declare them as
    `str` and the SM-2 code compares them lexicographically. Postgres types them
    properly and psycopg hands back datetime objects, which fail response
    validation, so convert at the boundary and keep the app's contract intact.
    """
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    return value


def _row_factory(cursor):
    make = dict_row(cursor)
    return lambda values: Row(
        {k: _as_text(v) for k, v in make(values).items()}
    )


class Cursor:
    def __init__(self, pg_cursor, lastrowid=None):
        self._cur = pg_cursor
        self.lastrowid = lastrowid

    def fetchone(self):
        return self._cur.fetchone() if self._cur.description else None

    def fetchall(self):
        return self._cur.fetchall() if self._cur.description else []

    @property
    def rowcount(self):
        return self._cur.rowcount


class Connection:
    def __init__(self, dsn: str):
        self._conn = psycopg.connect(dsn, row_factory=_row_factory)
        # Hosted Postgres is usually reached through PgBouncer. In transaction
        # pooling mode a server connection is reused between statements, so
        # psycopg's automatic prepared statements would be looked up on a backend
        # that never declared them ("prepared statement does not exist").
        self._conn.prepare_threshold = None

    def execute(self, sql: str, params=()) -> Cursor:
        sql = translate(sql)
        # sqlite3 exposes the generated key as lastrowid; Postgres needs RETURNING.
        wants_id = sql.lstrip().upper().startswith("INSERT") and "RETURNING" not in sql.upper()
        if wants_id:
            sql = sql.rstrip().rstrip(";") + " RETURNING id"

        cur = self._conn.cursor()
        cur.execute(sql, params)

        lastrowid = None
        if wants_id:
            row = cur.fetchone()
            # No row comes back when an ON CONFLICT clause suppressed the insert.
            lastrowid = row["id"] if row else None
        return Cursor(cur, lastrowid)

    def executemany(self, sql: str, seq_of_params) -> None:
        seq = list(seq_of_params)
        if not seq:
            return
        cur = self._conn.cursor()
        cur.executemany(translate(sql), seq)

    def executescript(self, script: str) -> None:
        self._conn.execute(translate(script))
        self._conn.commit()

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS word_lists (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    source_lang TEXT NOT NULL DEFAULT 'nl',
    target_lang TEXT NOT NULL DEFAULT 'en',
    source_file TEXT,
    builtin     INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS words (
    id                SERIAL PRIMARY KEY,
    list_id           INTEGER NOT NULL REFERENCES word_lists(id) ON DELETE CASCADE,
    source_word       TEXT NOT NULL,
    target_word       TEXT NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    manually_excluded INTEGER NOT NULL DEFAULT 0,
    UNIQUE(list_id, source_word)
);

CREATE TABLE IF NOT EXISTS word_progress (
    id              SERIAL PRIMARY KEY,
    word_id         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    mode            TEXT NOT NULL,
    repetitions     INTEGER NOT NULL DEFAULT 0,
    ease_factor     DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    interval_days   INTEGER NOT NULL DEFAULT 1,
    next_review_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    correct_count   INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    last_seen_at    TIMESTAMP,
    mastered        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(word_id, mode)
);

CREATE TABLE IF NOT EXISTS answer_events (
    id          SERIAL PRIMARY KEY,
    word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL,
    correct     INTEGER NOT NULL,
    time_ms     INTEGER,
    answered_at TIMESTAMP NOT NULL DEFAULT NOW()
);
"""
