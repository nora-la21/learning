import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "learning.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS words (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id      INTEGER NOT NULL REFERENCES word_lists(id) ON DELETE CASCADE,
            source_word  TEXT NOT NULL,
            target_word  TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(list_id, source_word)
        );

        CREATE TABLE IF NOT EXISTS word_progress (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id         INTEGER NOT NULL UNIQUE REFERENCES words(id) ON DELETE CASCADE,
            repetitions     INTEGER NOT NULL DEFAULT 0,
            ease_factor     REAL NOT NULL DEFAULT 2.5,
            interval_days   INTEGER NOT NULL DEFAULT 1,
            next_review_at  TEXT NOT NULL DEFAULT (datetime('now')),
            correct_count   INTEGER NOT NULL DEFAULT 0,
            incorrect_count INTEGER NOT NULL DEFAULT 0,
            last_seen_at    TEXT,
            mastered        INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS answer_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
            mode        TEXT NOT NULL CHECK(mode IN ('multiple_choice','reverse_mc','listening','type_it')),
            correct     INTEGER NOT NULL,
            time_ms     INTEGER,
            answered_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()
