"""Postgres backend exposing a sqlite3-compatible connection interface.

The app was written against sqlite3. Rather than rewrite ~60 call sites, this
module adapts psycopg to the same surface: `?` placeholders, `execute()`
returning a cursor, rows indexable by name or position, and `lastrowid`.
"""
import os
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
    # psycopg reads % as the start of a placeholder, so a literal one (LIKE 'de %')
    # has to be doubled. This must happen before ? becomes %s, or the placeholders
    # we just introduced would be escaped too.
    sql = sql.replace("%", "%%")
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


_pool = None
_pool_dsn = None


def _configure(conn) -> None:
    # Hosted Postgres is usually reached through PgBouncer. In transaction
    # pooling mode a server connection is reused between statements, so
    # psycopg's automatic prepared statements would be looked up on a backend
    # that never declared them ("prepared statement does not exist").
    conn.prepare_threshold = None


def _get_pool(dsn: str):
    """One pool per process.

    Every request used to open its own connection, which against a hosted
    database means a TCP and TLS handshake per request — and answering a
    question opens two. Pooling keeps a small set of connections warm instead.
    """
    global _pool, _pool_dsn
    if _pool is None or _pool_dsn != dsn:
        from psycopg_pool import ConnectionPool
        if _pool is not None:
            _pool.close()
        # Free tiers cap connections, and this is a single-process app, so the
        # pool stays small. check=... revives connections a sleeping host dropped.
        _pool = ConnectionPool(
            dsn,
            min_size=1,
            max_size=int(os.environ.get("DB_POOL_MAX", "5")),
            kwargs={"row_factory": _row_factory},
            configure=_configure,
            check=ConnectionPool.check_connection,
            open=True,
        )
        _pool_dsn = dsn
    return _pool


class Connection:
    def __init__(self, dsn: str):
        self._pool = _get_pool(dsn)
        self._conn = self._pool.getconn()
        self._released = False

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
        """Return the connection to the pool rather than dropping it."""
        if self._released:
            return
        self._released = True
        try:
            # Callers commit explicitly; anything still open is unfinished work
            # and must not leak into whoever checks this connection out next.
            self._conn.rollback()
        except Exception:
            pass
        self._pool.putconn(self._conn)


SCHEMA = """
CREATE TABLE IF NOT EXISTS word_lists (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER,
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
    user_id         INTEGER,
    mode            TEXT NOT NULL,
    repetitions     INTEGER NOT NULL DEFAULT 0,
    ease_factor     DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    interval_days   INTEGER NOT NULL DEFAULT 1,
    next_review_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    correct_count   INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    last_seen_at    TIMESTAMP,
    mastered        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, word_id, mode)
);

CREATE TABLE IF NOT EXISTS answer_events (
    id          SERIAL PRIMARY KEY,
    word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    user_id     INTEGER,
    mode        TEXT NOT NULL,
    correct     INTEGER NOT NULL,
    time_ms     INTEGER,
    answered_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_word_flags (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    known   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, word_id)
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER,
    endpoint   TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Every table carries an id: the adapter appends RETURNING id to inserts to
-- stand in for sqlite3's lastrowid, so a table without one breaks on insert.
CREATE TABLE IF NOT EXISTS game_sessions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER,
    session_id TEXT NOT NULL UNIQUE,
    data       TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
"""
