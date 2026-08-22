#!/usr/bin/env python3
"""Set an account's password directly against the database.

There is no self-serve password reset, because a reset needs an email sender
and this app has none. This is the fallback: run it against the live database
and it rewrites the hash.

    DATABASE_URL="postgresql://..." python set_password.py you@example.com

Omit DATABASE_URL to act on the local SQLite file instead. The password is
prompted for rather than passed as an argument, so it stays out of shell
history and the process list.

Every existing session for the account is revoked, on the assumption that if
you needed this you may not be the only one who knew the old password.
"""
import getpass
import sys

from database import get_db
from services import auth


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    email = auth.normalize_email(sys.argv[1])

    conn = get_db()
    try:
        row = conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
        if not row:
            known = conn.execute("SELECT email FROM users ORDER BY id").fetchall()
            print(f"No account for {email}.")
            if known:
                print("Accounts on this database:")
                for k in known:
                    print(f"  {k['email']}")
            return 1

        password = getpass.getpass("New password: ")
        if len(password) < auth.MIN_PASSWORD_LENGTH:
            print(f"Too short — at least {auth.MIN_PASSWORD_LENGTH} characters.")
            return 1
        if password != getpass.getpass("Repeat: "):
            print("The two entries do not match.")
            return 1

        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                     (auth.hash_password(password), row["id"]))
        revoked = conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (row["id"],))
        conn.commit()
    finally:
        conn.close()

    print(f"Password updated for {row['email']}.")
    print(f"Signed out {getattr(revoked, 'rowcount', 0) or 0} existing session(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
