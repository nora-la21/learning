"""Accounts and sessions, using only the standard library.

Password hashing is scrypt from hashlib rather than bcrypt or argon2, because
every extra native dependency here has to build on the deploy host, and that has
already broken this project twice.

Session tokens are random and stored hashed, so reading the database does not
hand anyone a working session.
"""
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from database import get_db

# Tuned for a small app on a free-tier CPU: costs roughly 100ms per attempt,
# which is slow enough to make guessing expensive and fast enough to log in.
SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1
DK_LEN = 32

SESSION_DAYS = 60
SIGNUP_DISABLED = os.environ.get("DISABLE_SIGNUP", "").strip().lower() in {"1", "true", "yes"}

MIN_PASSWORD_LENGTH = 8


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=DK_LEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"), salt=_unb64(salt),
            n=int(n), r=int(r), p=int(p), dklen=len(_unb64(expected)),
        )
    except Exception:
        return False
    # Constant time, so a wrong password cannot be narrowed down by timing.
    return hmac.compare_digest(digest, _unb64(expected))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    """Enough to catch typos. Deliverability is proven by delivering, not by regex."""
    email = email.strip()
    if len(email) < 3 or len(email) > 254 or any(c.isspace() for c in email):
        return False
    local, sep, domain = email.rpartition("@")
    return bool(sep and local and "." in domain and not domain.startswith(".")
                and not domain.endswith("."))


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).strftime(
        "%Y-%m-%d %H:%M:%S")
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (user_id, _token_fingerprint(token), expires),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def revoke_session(token: str) -> None:
    conn = get_db()
    try:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?",
                     (_token_fingerprint(token),))
        conn.commit()
    finally:
        conn.close()


def user_for_token(token: str):
    """Resolve a bearer token to a user row, or None."""
    if not token:
        return None
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT u.id, u.email FROM auth_sessions s "
            "JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > datetime('now')",
            (_token_fingerprint(token),),
        ).fetchone()
    finally:
        conn.close()
    return row


def create_user(email: str, password: str) -> int:
    """Create an account. The first one adopts any data that predates accounts."""
    email = normalize_email(email)
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise ValueError("An account with that email already exists")

        first_user = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
        user_id = conn.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (email, hash_password(password)),
        ).lastrowid

        if first_user:
            _adopt_orphaned_data(conn, user_id)

        conn.commit()
        return user_id
    finally:
        conn.close()


def _adopt_orphaned_data(conn, user_id: int) -> None:
    """Hand pre-account data to the first account.

    This app ran without accounts for a while, so the existing lists and
    progress belong to whoever installed it. Without this they would be
    invisible to everyone the moment accounts arrive.
    """
    conn.execute("UPDATE word_lists SET user_id = ? WHERE user_id IS NULL AND builtin = 0",
                 (user_id,))
    for table in ("word_progress", "answer_events", "push_subscriptions", "game_sessions"):
        conn.execute(f"UPDATE {table} SET user_id = ? WHERE user_id IS NULL", (user_id,))


def count_users() -> int:
    conn = get_db()
    try:
        return conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    finally:
        conn.close()
