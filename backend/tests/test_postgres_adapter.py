"""Unit tests for the SQL translation layer.

These need no database. They exist because the translation is pattern-based, so
a wrong pattern produces valid SQL that quietly returns the wrong rows — the
kind of bug that shows up as an empty chart rather than an error.
"""
import pytest

pytest.importorskip("psycopg", reason="psycopg is only needed for the Postgres adapter")

from db_postgres import translate  # noqa: E402


class TestDateTranslation:
    def test_negative_offset_looks_backwards(self):
        """Regression: the sign lives inside the interval, so it must be ADDED.

        Subtracting INTERVAL '-7 days' resolves to seven days in the FUTURE,
        which silently emptied the 7-day accuracy window and the heatmap.
        """
        out = translate("WHERE answered_at >= datetime('now', '-7 days')")
        assert "NOW() + INTERVAL '-7 days'" in out
        assert "NOW() - INTERVAL '-7 days'" not in out

    def test_year_window(self):
        assert "NOW() + INTERVAL '-365 days'" in translate(
            "WHERE answered_at >= datetime('now', '-365 days')")

    def test_positive_offset_still_looks_forward(self):
        assert "NOW() + INTERVAL '+3 days'" in translate(
            "WHERE due <= datetime('now', '+3 days')")

    def test_bare_now(self):
        assert translate("WHERE next_review_at <= datetime('now')") == \
            "WHERE next_review_at <= NOW()"

    def test_date_becomes_iso_string(self):
        # _compute_streak parses these with date.fromisoformat.
        assert "TO_CHAR(answered_at, 'YYYY-MM-DD')" in translate(
            "SELECT DATE(answered_at) as day FROM answer_events")


class TestPlaceholders:
    def test_question_marks_become_pyformat(self):
        assert translate("WHERE list_id=? AND source_word=?") == \
            "WHERE list_id=%s AND source_word=%s"

    def test_generated_in_clause(self):
        # game_engine builds these with ','.join('?' * n)
        sql = f"WHERE id IN ({','.join('?' * 3)})"
        assert translate(sql) == "WHERE id IN (%s,%s,%s)"

    def test_literal_percent_is_escaped(self):
        """psycopg reads % as a placeholder marker, so a literal one must double.

        Without this, any LIKE pattern raises
        "only '%s', '%b', '%t' are allowed as placeholders".
        """
        assert translate("WHERE source_word LIKE 'de %'") == \
            "WHERE source_word LIKE 'de %%'"

    def test_literal_percent_alongside_a_placeholder(self):
        out = translate("WHERE w LIKE '%x%' AND id = ?")
        assert out == "WHERE w LIKE '%%x%%' AND id = %s"


class TestConflictHandling:
    def test_insert_or_ignore(self):
        """Duplicate rows must be skipped in SQL.

        Catching the constraint error instead aborts the whole Postgres
        transaction, which silently discarded an entire upload.
        """
        out = translate(
            "INSERT OR IGNORE INTO words (list_id, source_word) VALUES (?, ?)")
        assert out.startswith("INSERT INTO words")
        assert out.endswith("ON CONFLICT DO NOTHING")
        assert "OR IGNORE" not in out

    def test_plain_insert_untouched(self):
        out = translate("INSERT INTO words (list_id) VALUES (?)")
        assert "ON CONFLICT" not in out


class TestRowFactory:
    def test_row_supports_name_and_ordinal(self):
        """progress.py reads .fetchone()[0]; everything else reads by name."""
        from db_postgres import Row
        r = Row({"count": 7, "name": "x"})
        assert r[0] == 7
        assert r["count"] == 7
        assert r[1] == "x"

    def test_timestamps_render_as_sqlite_did(self):
        """Response models declare these as str, and SM-2 compares them as text."""
        from datetime import date, datetime
        from db_postgres import _as_text
        assert _as_text(datetime(2026, 8, 13, 14, 5, 6)) == "2026-08-13 14:05:06"
        assert _as_text(date(2026, 8, 13)) == "2026-08-13"
        assert _as_text(42) == 42
        assert _as_text(None) is None
