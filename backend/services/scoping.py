"""Helpers for keeping one account's data out of another's.

"I already know this word" used to be a column on `words`. Built-in lists are
shared by everyone, so that made the flag global: one person marking a word
known would hide it from every other account. It now lives in user_word_flags,
keyed by (user_id, word_id).

Reading it means a LEFT JOIN, which is easy to get subtly wrong in twenty
places, so the join and its predicate are written once here.
"""

# Joins the current user's flag onto an existing `words` alias.
KNOWN_JOIN = "LEFT JOIN user_word_flags uwf ON uwf.word_id = {alias}.id AND uwf.user_id = ?"

# A word with no row, or a row set to 0, is not known.
NOT_KNOWN = "COALESCE(uwf.known, 0) = 0"
IS_KNOWN = "COALESCE(uwf.known, 0) = 1"


def known_join(alias: str = "w") -> str:
    return KNOWN_JOIN.format(alias=alias)


def set_known(conn, user_id: int, word_id: int, known: bool) -> None:
    """Upsert without relying on dialect-specific ON CONFLICT ... DO UPDATE."""
    updated = conn.execute(
        "UPDATE user_word_flags SET known = ? WHERE user_id = ? AND word_id = ?",
        (1 if known else 0, user_id, word_id),
    )
    if not updated.rowcount:
        conn.execute(
            "INSERT OR IGNORE INTO user_word_flags (user_id, word_id, known) VALUES (?, ?, ?)",
            (user_id, word_id, 1 if known else 0),
        )


def is_known(conn, user_id: int, word_id: int) -> bool:
    row = conn.execute(
        "SELECT known FROM user_word_flags WHERE user_id = ? AND word_id = ?",
        (user_id, word_id),
    ).fetchone()
    return bool(row and row["known"])


def owns_list(conn, user_id: int, list_id: int) -> bool:
    """Built-in lists are readable by everyone; custom lists only by their owner."""
    row = conn.execute(
        "SELECT builtin, user_id FROM word_lists WHERE id = ?", (list_id,)
    ).fetchone()
    if not row:
        return False
    return bool(row["builtin"]) or row["user_id"] == user_id


def visible_word(conn, user_id: int, word_id: int) -> bool:
    row = conn.execute(
        "SELECT wl.builtin, wl.user_id FROM words w "
        "JOIN word_lists wl ON wl.id = w.list_id WHERE w.id = ?", (word_id,)
    ).fetchone()
    if not row:
        return False
    return bool(row["builtin"]) or row["user_id"] == user_id
