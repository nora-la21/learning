"""Registration, login, and the dependency that identifies the caller."""
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from services import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    # Deliberately a plain str: pydantic's EmailStr pulls in email-validator,
    # and every added dependency is another thing that can fail to build on deploy.
    email: str
    password: str


def _bearer(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


def current_user(authorization: str | None = Header(default=None)):
    """Every endpoint holding user data depends on this."""
    user = auth.user_for_token(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return user


def optional_user(authorization: str | None = Header(default=None)):
    return auth.user_for_token(_bearer(authorization))


@router.get("/status")
def status():
    """Lets the UI decide between a sign-in and a sign-up screen."""
    return {
        "signup_disabled": auth.SIGNUP_DISABLED,
        "has_accounts": auth.count_users() > 0,
    }


@router.post("/register")
def register(body: Credentials):
    if auth.SIGNUP_DISABLED:
        raise HTTPException(status_code=403, detail="Registration is closed on this server")
    if len(body.password) < auth.MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {auth.MIN_PASSWORD_LENGTH} characters",
        )
    if not auth.valid_email(body.email):
        raise HTTPException(status_code=400, detail="That does not look like an email address")
    try:
        user_id = auth.create_user(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"token": auth.issue_session(user_id), "email": auth.normalize_email(body.email)}


@router.post("/login")
def login(body: Credentials):
    from database import get_db
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE email = ?",
            (auth.normalize_email(body.email),),
        ).fetchone()
    finally:
        conn.close()
    # One message for both cases, so this cannot be used to enumerate accounts.
    if not row or not auth.verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    return {"token": auth.issue_session(row["id"]), "email": auth.normalize_email(body.email)}


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(body: PasswordChange, user=Depends(current_user),
                    authorization: str | None = Header(default=None)):
    """Change the password of the signed-in account.

    The current password is required even though the caller already holds a
    valid token: a token left behind on a shared machine should not be enough
    to lock the owner out of their own account.
    """
    stored = auth.password_hash_for(user["id"])
    if not stored or not auth.verify_password(body.current_password, stored):
        raise HTTPException(status_code=403, detail="Current password is wrong")
    if len(body.new_password) < auth.MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {auth.MIN_PASSWORD_LENGTH} characters",
        )
    auth.set_password(user["id"], body.new_password, keep_token=_bearer(authorization))
    return {"ok": True}


@router.post("/logout", status_code=204)
def logout(authorization: str | None = Header(default=None)):
    token = _bearer(authorization)
    if token:
        auth.revoke_session(token)


@router.get("/me")
def me(user=Depends(current_user)):
    return {"id": user["id"], "email": user["email"]}
