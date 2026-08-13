"""Backend-independent export and import.

Downloading the SQLite file only ever worked on one backend, and on Postgres
there is no file to hand over. This moves the data itself — user lists, words,
and per-mode progress — as JSON, so it works the same either way and stays
readable a decade from now.

Built-in lists are not exported: they ship with the app and are recreated at
startup. Their *progress* is, keyed by the word itself, so a re-import restores
how well you know the built-in vocabulary too.
"""
from database import get_db

FORMAT_VERSION = 1

PROGRESS_COLUMNS = (
    "mode", "repetitions", "ease_factor", "interval_days",
    "next_review_at", "correct_count", "incorrect_count", "last_seen_at", "mastered",
)


def export_all() -> dict:
    conn = get_db()
    try:
        lists = conn.execute(
            "SELECT id, name, source_lang, target_lang, builtin FROM word_lists ORDER BY id"
        ).fetchall()
        words = conn.execute(
            "SELECT id, list_id, source_word, target_word, manually_excluded "
            "FROM words ORDER BY id"
        ).fetchall()
        progress = conn.execute(
            f"SELECT word_id, {', '.join(PROGRESS_COLUMNS)} FROM word_progress ORDER BY word_id"
        ).fetchall()
    finally:
        conn.close()

    list_by_id = {l["id"]: l for l in lists}
    word_by_id = {w["id"]: w for w in words}
    progress_by_word: dict[int, list] = {}
    for row in progress:
        progress_by_word.setdefault(row["word_id"], []).append(
            {c: row[c] for c in PROGRESS_COLUMNS}
        )

    out_lists = []
    for lst in lists:
        if lst["builtin"]:
            continue
        out_lists.append({
            "name": lst["name"],
            "source_lang": lst["source_lang"],
            "target_lang": lst["target_lang"],
            "words": [
                {
                    "source_word": w["source_word"],
                    "target_word": w["target_word"],
                    "known": bool(w["manually_excluded"]),
                    "progress": progress_by_word.get(w["id"], []),
                }
                for w in words if w["list_id"] == lst["id"]
            ],
        })

    # Built-in progress travels keyed by the word, since ids are not stable
    # across installs but the vocabulary is.
    builtin_progress = []
    for word_id, entries in progress_by_word.items():
        word = word_by_id.get(word_id)
        # Rows are not dicts on the SQLite side, so index rather than .get().
        parent = list_by_id.get(word["list_id"]) if word is not None else None
        if parent is None or not parent["builtin"]:
            continue
        builtin_progress.append({
            "list_name": parent["name"],
            "source_word": word["source_word"],
            "known": bool(word["manually_excluded"]),
            "progress": entries,
        })

    return {
        "format": "dutch-vocab-export",
        "version": FORMAT_VERSION,
        "lists": out_lists,
        "builtin_progress": builtin_progress,
    }


def import_all(payload: dict) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != "dutch-vocab-export":
        raise ValueError("That file is not a vocabulary export")
    if payload.get("version") != FORMAT_VERSION:
        raise ValueError(f"Unsupported export version: {payload.get('version')!r}")

    conn = get_db()
    added_lists = added_words = restored = 0
    try:
        for lst in payload.get("lists") or []:
            name = (lst.get("name") or "").strip()
            if not name:
                continue
            row = conn.execute(
                "SELECT id FROM word_lists WHERE name = ? AND builtin = 0", (name,)
            ).fetchone()
            if row:
                list_id = row["id"]
            else:
                list_id = conn.execute(
                    "INSERT INTO word_lists (name, source_lang, target_lang, builtin) "
                    "VALUES (?, ?, ?, 0)",
                    (name, lst.get("source_lang") or "nl", lst.get("target_lang") or "en"),
                ).lastrowid
                added_lists += 1

            for word in lst.get("words") or []:
                source = (word.get("source_word") or "").strip()
                target = (word.get("target_word") or "").strip()
                if not source or not target:
                    continue
                existing = conn.execute(
                    "SELECT id FROM words WHERE list_id = ? AND source_word = ?",
                    (list_id, source),
                ).fetchone()
                if existing:
                    word_id = existing["id"]
                else:
                    word_id = conn.execute(
                        "INSERT INTO words (list_id, source_word, target_word) VALUES (?, ?, ?)",
                        (list_id, source, target),
                    ).lastrowid
                    added_words += 1
                if word.get("known"):
                    conn.execute(
                        "UPDATE words SET manually_excluded = 1 WHERE id = ?", (word_id,))
                restored += _restore_progress(conn, word_id, word.get("progress") or [])

        for entry in payload.get("builtin_progress") or []:
            row = conn.execute(
                "SELECT w.id FROM words w JOIN word_lists wl ON wl.id = w.list_id "
                "WHERE wl.name = ? AND wl.builtin = 1 AND w.source_word = ?",
                (entry.get("list_name"), entry.get("source_word")),
            ).fetchone()
            if not row:
                continue   # that built-in list or word is not in this install
            if entry.get("known"):
                conn.execute(
                    "UPDATE words SET manually_excluded = 1 WHERE id = ?", (row["id"],))
            restored += _restore_progress(conn, row["id"], entry.get("progress") or [])

        conn.commit()
    finally:
        conn.close()

    return {
        "lists_added": added_lists,
        "words_added": added_words,
        "progress_restored": restored,
    }


def _restore_progress(conn, word_id: int, entries: list) -> int:
    """Write progress rows, leaving any the user already has untouched."""
    written = 0
    for entry in entries:
        mode = entry.get("mode")
        if not mode:
            continue
        exists = conn.execute(
            "SELECT id FROM word_progress WHERE word_id = ? AND mode = ?", (word_id, mode)
        ).fetchone()
        if exists:
            continue
        conn.execute(
            "INSERT INTO word_progress "
            "(word_id, mode, repetitions, ease_factor, interval_days, next_review_at, "
            " correct_count, incorrect_count, last_seen_at, mastered) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                word_id, mode,
                entry.get("repetitions") or 0,
                entry.get("ease_factor") or 2.5,
                entry.get("interval_days") or 1,
                entry.get("next_review_at"),
                entry.get("correct_count") or 0,
                entry.get("incorrect_count") or 0,
                entry.get("last_seen_at"),
                1 if entry.get("mastered") else 0,
            ),
        )
        written += 1
    return written
