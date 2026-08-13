"""Accounts, sessions, and the migration onto a database that predates them."""
import database
from services import auth
from conftest import reset_database


def register(client, email="nora@example.com", password="correct horse battery"):
    return client.post("/api/auth/register", json={"email": email, "password": password})


class TestPasswordHashing:
    def test_hash_is_salted(self):
        """Two identical passwords must not produce identical hashes."""
        assert auth.hash_password("same") != auth.hash_password("same")

    def test_verifies_the_right_password(self):
        stored = auth.hash_password("correct horse battery")
        assert auth.verify_password("correct horse battery", stored)

    def test_rejects_the_wrong_password(self):
        stored = auth.hash_password("correct horse battery")
        assert not auth.verify_password("Correct horse battery", stored)
        assert not auth.verify_password("", stored)

    def test_plaintext_never_appears_in_the_hash(self):
        assert "hunter2" not in auth.hash_password("hunter2")

    def test_corrupt_hash_fails_closed(self):
        for bad in ("", "nonsense", "scrypt$only$three", "bcrypt$1$2$3$4$5"):
            assert not auth.verify_password("anything", bad)


class TestEmailValidation:
    def test_accepts_ordinary_addresses(self):
        for good in ("a@b.co", "nora.l@example.com", "x+tag@sub.domain.org"):
            assert auth.valid_email(good), good

    def test_rejects_malformed_addresses(self):
        for bad in ("", "nope", "a@b", "a@.com", "a@b.", "with space@b.co", "@b.co"):
            assert not auth.valid_email(bad), bad

    def test_email_is_case_and_space_insensitive(self):
        assert auth.normalize_email("  Nora@Example.COM ") == "nora@example.com"


class TestRegistration:
    def test_returns_a_token(self, client):
        reset_database()
        r = register(client)
        assert r.status_code == 200, r.text
        assert r.json()["token"]
        assert r.json()["email"] == "nora@example.com"

    def test_rejects_a_duplicate_email(self, client):
        reset_database()
        register(client)
        r = register(client, email="NORA@example.com")   # same address, different case
        assert r.status_code == 409

    def test_rejects_a_short_password(self, client):
        reset_database()
        r = register(client, password="short")
        assert r.status_code == 400

    def test_rejects_a_malformed_email(self, client):
        reset_database()
        assert register(client, email="not-an-email").status_code == 400

    def test_can_be_closed_off(self, client, monkeypatch):
        reset_database()
        monkeypatch.setattr(auth, "SIGNUP_DISABLED", True)
        assert register(client).status_code == 403


class TestLogin:
    def test_succeeds_with_the_right_password(self, client):
        reset_database()
        register(client)
        r = client.post("/api/auth/login", json={
            "email": "nora@example.com", "password": "correct horse battery"})
        assert r.status_code == 200, r.text
        assert r.json()["token"]

    def test_fails_with_the_wrong_password(self, client):
        reset_database()
        register(client)
        r = client.post("/api/auth/login", json={
            "email": "nora@example.com", "password": "wrong"})
        assert r.status_code == 401

    def test_unknown_and_wrong_password_are_indistinguishable(self, client):
        """Otherwise the endpoint tells an attacker which emails have accounts."""
        reset_database()
        register(client)
        missing = client.post("/api/auth/login", json={
            "email": "nobody@example.com", "password": "whatever"})
        wrong = client.post("/api/auth/login", json={
            "email": "nora@example.com", "password": "whatever"})
        assert missing.status_code == wrong.status_code == 401
        assert missing.json()["detail"] == wrong.json()["detail"]


class TestSessions:
    def test_me_requires_a_token(self, client):
        reset_database()
        assert client.get("/api/auth/me").status_code == 401

    def test_me_returns_the_signed_in_user(self, client):
        reset_database()
        token = register(client).json()["token"]
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        assert r.json()["email"] == "nora@example.com"

    def test_a_bogus_token_is_rejected(self, client):
        reset_database()
        register(client)
        assert client.get("/api/auth/me",
                          headers={"Authorization": "Bearer made-up"}).status_code == 401

    def test_malformed_authorization_header_is_rejected(self, client):
        reset_database()
        token = register(client).json()["token"]
        for header in (token, f"Basic {token}", "Bearer", ""):
            assert client.get("/api/auth/me",
                              headers={"Authorization": header}).status_code == 401

    def test_logout_invalidates_the_token(self, client):
        reset_database()
        token = register(client).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.post("/api/auth/logout", headers=headers).status_code == 204
        assert client.get("/api/auth/me", headers=headers).status_code == 401

    def test_raw_token_is_not_stored(self, client, db):
        """A database leak must not hand over working sessions."""
        reset_database()
        token = register(client).json()["token"]
        rows = db.execute("SELECT token_hash FROM auth_sessions").fetchall()
        assert rows
        assert all(r["token_hash"] != token for r in rows)

    def test_expired_sessions_are_refused(self, client, db):
        reset_database()
        token = register(client).json()["token"]
        db.execute("UPDATE auth_sessions SET expires_at = ?", ("2020-01-01 00:00:00",))
        db.commit()
        assert client.get("/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"}).status_code == 401


class TestFirstAccountAdoptsExistingData:
    """The app ran without accounts, so existing data has no owner.

    Without adoption, everything already in the database would become invisible
    the moment accounts arrive.
    """

    def test_existing_lists_and_progress_are_claimed(self, client, db):
        reset_database()
        lid = client.post("/api/lists", params={"name": "Pre-accounts"}).json()["id"]
        client.post("/api/words/quick-add", json={
            "list_id": lid, "source_word": "oud", "target_word": "old"})

        user_id = register(client).json() and db.execute(
            "SELECT id FROM users WHERE email = ?", ("nora@example.com",)).fetchone()["id"]

        owner = db.execute("SELECT user_id FROM word_lists WHERE id = ?", (lid,)).fetchone()
        assert owner["user_id"] == user_id

    def test_built_in_lists_stay_shared(self, client, db):
        """Built-ins are seeded for everyone; one account must not seize them."""
        reset_database()
        register(client)
        unowned = db.execute(
            "SELECT COUNT(*) AS n FROM word_lists WHERE builtin = 1 AND user_id IS NULL"
        ).fetchone()["n"]
        assert unowned > 100

    def test_only_the_first_account_adopts(self, client, db):
        reset_database()
        lid = client.post("/api/lists", params={"name": "Owned"}).json()["id"]
        register(client)
        first = db.execute("SELECT user_id FROM word_lists WHERE id = ?", (lid,)).fetchone()["user_id"]

        register(client, email="second@example.com")
        still = db.execute("SELECT user_id FROM word_lists WHERE id = ?", (lid,)).fetchone()["user_id"]
        assert still == first, "a later account took over the first account's data"


class TestMigrationFromPreAccountSchema:
    """Simulates the live database: tables that exist without ownership columns."""

    def test_columns_are_added_and_data_survives(self):
        import migrations
        reset_database()

        conn = database.get_db()
        # Drop the ownership columns to recreate the pre-accounts shape.
        if database.USE_POSTGRES:
            for table, column in migrations.OWNERSHIP_COLUMNS:
                conn.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}")
            conn.commit()
            before = conn.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
            assert not migrations._has_column(conn, "word_lists", "user_id")

            migrations.run(conn)

            for table, column in migrations.OWNERSHIP_COLUMNS:
                assert migrations._has_column(conn, table, column), f"{table}.{column} missing"
            after = conn.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
            assert after == before, "migration lost rows"
        conn.close()

    def test_two_users_can_practise_the_same_word(self, db):
        """The old UNIQUE(word_id, mode) made the second user collide with the first."""
        import migrations
        reset_database()
        migrations.run(db)

        word_id = db.execute("SELECT id FROM words LIMIT 1").fetchone()["id"]
        db.execute(
            "INSERT INTO word_progress (word_id, user_id, mode) VALUES (?, ?, ?)",
            (word_id, 1, "multiple_choice"))
        db.execute(
            "INSERT INTO word_progress (word_id, user_id, mode) VALUES (?, ?, ?)",
            (word_id, 2, "multiple_choice"))
        db.commit()

        rows = db.execute(
            "SELECT COUNT(*) AS n FROM word_progress WHERE word_id = ? AND mode = ?",
            (word_id, "multiple_choice")).fetchone()["n"]
        assert rows == 2

    def test_migration_is_idempotent(self, db):
        import migrations
        reset_database()
        for _ in range(3):
            migrations.run(db)   # must not raise or duplicate anything
        assert migrations._has_column(db, "word_lists", "user_id")


def test_status_endpoint_reports_whether_anyone_has_registered(client):
    reset_database()
    assert client.get("/api/auth/status").json()["has_accounts"] is False
    register(client)
    assert client.get("/api/auth/status").json()["has_accounts"] is True
