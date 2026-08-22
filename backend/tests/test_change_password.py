"""Changing a password, and what that does to sessions elsewhere."""
from conftest import reset_database

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def account():
    reset_database()
    import main
    with TestClient(main.app) as c:
        r = c.post("/api/auth/register",
                   json={"email": "pw@example.com", "password": "original-password"})
        assert r.status_code == 200, r.text
        c.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
        yield c


def test_wrong_current_password_is_refused(account):
    r = account.post("/api/auth/change-password", json={
        "current_password": "not-the-password", "new_password": "brand-new-password"})
    assert r.status_code == 403
    # And the old password still works, i.e. nothing was written.
    import main
    with TestClient(main.app) as c:
        assert c.post("/api/auth/login", json={
            "email": "pw@example.com", "password": "original-password"}).status_code == 200


def test_short_password_is_refused(account):
    r = account.post("/api/auth/change-password", json={
        "current_password": "original-password", "new_password": "short"})
    assert r.status_code == 400


def test_anonymous_cannot_change_a_password(anon_client):
    r = anon_client.post("/api/auth/change-password", json={
        "current_password": "original-password", "new_password": "brand-new-password"})
    assert r.status_code == 401


def test_change_replaces_the_password_and_drops_other_sessions(account):
    import main
    # A second device signed in with the old password.
    other = TestClient(main.app)
    r = other.post("/api/auth/login", json={
        "email": "pw@example.com", "password": "original-password"})
    assert r.status_code == 200
    other.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    assert other.get("/api/auth/me").status_code == 200

    r = account.post("/api/auth/change-password", json={
        "current_password": "original-password", "new_password": "a-better-password"})
    assert r.status_code == 200, r.text

    # The caller keeps working; the other device is signed out.
    assert account.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    other.close()

    with TestClient(main.app) as c:
        assert c.post("/api/auth/login", json={
            "email": "pw@example.com", "password": "original-password"}).status_code == 401
        assert c.post("/api/auth/login", json={
            "email": "pw@example.com", "password": "a-better-password"}).status_code == 200


def test_change_does_not_touch_another_account(account, other_client):
    assert other_client.get("/api/auth/me").status_code == 200
    r = account.post("/api/auth/change-password", json={
        "current_password": "a-better-password", "new_password": "third-password-here"})
    assert r.status_code == 200, r.text
    assert other_client.get("/api/auth/me").status_code == 200
