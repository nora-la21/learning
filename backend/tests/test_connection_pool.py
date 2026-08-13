"""Connections must be reused rather than re-established per request.

Against a hosted database each new connection costs a TCP and TLS handshake,
and answering a single question opens two of them.
"""
import pytest

import database
from conftest import biggest_builtin, play

pytestmark = pytest.mark.skipif(
    not database.USE_POSTGRES, reason="pooling only applies to the Postgres backend"
)


@pytest.fixture(scope="module", autouse=True)
def _schema(client):
    """These tests touch tables directly, so the schema has to exist first."""
    return client


def backend_pids(conn_factory, n=6):
    """Server-side PID for each of n sequential checkouts."""
    pids = []
    for _ in range(n):
        conn = conn_factory()
        pids.append(conn.execute("SELECT pg_backend_pid() AS pid").fetchone()["pid"])
        conn.close()
    return pids


def test_sequential_requests_reuse_a_connection():
    """Without a pool every checkout is its own backend."""
    pids = backend_pids(database.get_db, n=8)
    assert len(set(pids)) < len(pids), f"every checkout opened a new backend: {pids}"
    # A sequential caller never needs more than a couple of connections.
    assert len(set(pids)) <= 2, f"pool grew unexpectedly: {sorted(set(pids))}"


def test_closing_returns_the_connection_instead_of_dropping_it():
    """A second round of checkouts must not introduce backends the first didn't use."""
    first = set(backend_pids(database.get_db, n=6))
    second = set(backend_pids(database.get_db, n=6))
    assert second <= first, (
        f"new backends appeared instead of reusing the pool: {sorted(second - first)}"
    )


def test_close_is_idempotent():
    conn = database.get_db()
    conn.close()
    conn.close()   # a double close must not corrupt the pool
    probe = database.get_db()
    assert probe.execute("SELECT 1 AS one").fetchone()["one"] == 1
    probe.close()


def test_uncommitted_work_does_not_leak_to_the_next_caller():
    """A returned connection must not carry an open transaction."""
    conn = database.get_db()
    conn.execute("INSERT INTO word_lists (name, source_lang, target_lang) VALUES (?, ?, ?)",
                 ("Uncommitted", "nl", "en"))
    conn.close()   # deliberately no commit

    check = database.get_db()
    try:
        found = check.execute(
            "SELECT COUNT(*) AS n FROM word_lists WHERE name = ?", ("Uncommitted",)
        ).fetchone()["n"]
    finally:
        check.close()
    assert found == 0, "an uncommitted write survived the connection being returned"


def test_playing_a_session_does_not_exhaust_the_pool(client):
    """Answering opens two connections per question; the pool must recycle them."""
    lid = biggest_builtin(client)["id"]
    assert play(client, lid, size=5) > 0
    probe = database.get_db()
    try:
        assert probe.execute("SELECT 1 AS one").fetchone()["one"] == 1
    finally:
        probe.close()
