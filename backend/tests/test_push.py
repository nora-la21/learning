"""Review reminders.

Delivery itself needs a real browser and a real push service, so what is
verified here is everything up to the wire: the VAPID token a push service would
check, subscription bookkeeping, and the rules about when a notification is sent
at all.
"""
import base64
import importlib
import json

import pytest

pytest.importorskip("cryptography")

from cryptography.hazmat.primitives import hashes            # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec     # noqa: E402
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature  # noqa: E402

import database                                              # noqa: E402
from services import push                                    # noqa: E402
from conftest import biggest_builtin, current_user_id        # noqa: E402

ENDPOINT = "https://fcm.googleapis.com/fcm/send/fake-endpoint-123"


@pytest.fixture(scope="module")
def keys():
    """A throwaway VAPID keypair, applied to the already-imported modules."""
    public, private = push.generate_keys()
    push.VAPID_PUBLIC_KEY = public
    push.VAPID_PRIVATE_KEY = private
    push.VAPID_SUBJECT = "mailto:test@example.com"
    yield public, private


class TestKeyGeneration:
    def test_public_key_is_an_uncompressed_p256_point(self):
        public, _ = push.generate_keys()
        raw = push.b64url_decode(public)
        assert len(raw) == 65
        assert raw[0] == 0x04

    def test_private_key_is_32_bytes(self):
        _, private = push.generate_keys()
        assert len(push.b64url_decode(private)) == 32

    def test_keys_are_url_safe_and_unpadded(self):
        public, private = push.generate_keys()
        for value in (public, private):
            assert "=" not in value and "+" not in value and "/" not in value


class TestVapidHeader:
    def test_header_shape(self, keys):
        header = push.build_vapid_header(ENDPOINT)
        assert header.startswith("vapid t=")
        assert ", k=" in header

    def test_claims_target_the_push_service_origin(self, keys):
        header = push.build_vapid_header(ENDPOINT)
        token = header.split("t=")[1].split(",")[0]
        claims = json.loads(push.b64url_decode(token.split(".")[1]))
        # Not the full URL: RFC 8292 audiences are scheme://host only.
        assert claims["aud"] == "https://fcm.googleapis.com"
        assert claims["sub"] == "mailto:test@example.com"

    def test_token_expires_within_a_day(self, keys):
        header = push.build_vapid_header(ENDPOINT, now=1_000_000)
        token = header.split("t=")[1].split(",")[0]
        claims = json.loads(push.b64url_decode(token.split(".")[1]))
        assert 0 < claims["exp"] - 1_000_000 <= 24 * 3600

    def test_algorithm_is_es256(self, keys):
        header = push.build_vapid_header(ENDPOINT)
        token = header.split("t=")[1].split(",")[0]
        assert json.loads(push.b64url_decode(token.split(".")[0])) == {
            "typ": "JWT", "alg": "ES256"}

    def test_signature_verifies_against_the_advertised_key(self, keys):
        """This is what the push service does before accepting the request."""
        public, _ = keys
        header = push.build_vapid_header(ENDPOINT)
        token = header.split("t=")[1].split(",")[0]
        head, claims, signature = token.split(".")

        raw = push.b64url_decode(signature)
        assert len(raw) == 64, "JWS needs raw r||s, not a DER blob"
        r = int.from_bytes(raw[:32], "big")
        s = int.from_bytes(raw[32:], "big")

        key = ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(), push.b64url_decode(public))
        key.verify(encode_dss_signature(r, s),
                   f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))

    def test_advertised_key_matches_the_signing_key(self, keys):
        public, _ = keys
        header = push.build_vapid_header(ENDPOINT)
        assert header.split(", k=")[1] == public


class TestConfigEndpoint:
    def test_reports_disabled_without_keys(self, client, monkeypatch):
        monkeypatch.setattr(push, "VAPID_PUBLIC_KEY", "")
        monkeypatch.setattr(push, "VAPID_PRIVATE_KEY", "")
        body = client.get("/api/push/config").json()
        assert body["enabled"] is False

    def test_reports_enabled_and_serves_the_public_key(self, client, keys):
        body = client.get("/api/push/config").json()
        assert body["enabled"] is True
        assert body["public_key"] == keys[0]


class TestSubscriptions:
    def test_subscribe_then_unsubscribe(self, client, keys, db):
        assert client.post("/api/push/subscribe",
                           json={"endpoint": ENDPOINT}).status_code == 204
        stored = db.execute(
            "SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?",
            (ENDPOINT,)).fetchone()["n"]
        assert stored == 1

        assert client.post("/api/push/unsubscribe",
                           json={"endpoint": ENDPOINT}).status_code == 204
        stored = db.execute(
            "SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?",
            (ENDPOINT,)).fetchone()["n"]
        assert stored == 0

    def test_subscribing_twice_stores_one_row(self, client, keys, db):
        for _ in range(2):
            client.post("/api/push/subscribe", json={"endpoint": ENDPOINT})
        stored = db.execute(
            "SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?",
            (ENDPOINT,)).fetchone()["n"]
        assert stored == 1
        client.post("/api/push/unsubscribe", json={"endpoint": ENDPOINT})

    def test_rejects_a_non_https_endpoint(self, client, keys):
        assert client.post("/api/push/subscribe",
                           json={"endpoint": "http://insecure.example/x"}).status_code == 400

    def test_unsubscribing_something_unknown_is_harmless(self, client):
        assert client.post("/api/push/unsubscribe",
                           json={"endpoint": "https://nope.example/x"}).status_code == 204


class TestSendDue:
    def test_requires_the_cron_secret(self, client, keys, monkeypatch):
        from routers import push as push_router
        monkeypatch.setattr(push_router, "CRON_SECRET", "s3cret")
        assert client.post("/api/push/send-due").status_code == 403
        assert client.post("/api/push/send-due", params={"key": "wrong"}).status_code == 403

    def test_refuses_when_no_secret_is_configured(self, client, keys, monkeypatch):
        """An unset secret must not mean an open endpoint."""
        from routers import push as push_router
        monkeypatch.setattr(push_router, "CRON_SECRET", "")
        assert client.post("/api/push/send-due", params={"key": ""}).status_code == 403

    def test_sends_nothing_when_nothing_is_due(self, client, keys, monkeypatch):
        from routers import push as push_router
        monkeypatch.setattr(push_router, "CRON_SECRET", "s3cret")
        sent = []
        monkeypatch.setattr(push_router.push, "send_push", lambda e, **k: sent.append(e) or 201)

        body = client.post("/api/push/send-due", params={"key": "s3cret"}).json()
        assert body["due"] == 0
        assert body["sent"] == 0
        assert sent == [], "a notification went out with nothing to review"

    def test_notifies_subscribers_when_words_are_due(self, client, keys, monkeypatch):
        from routers import push as push_router
        monkeypatch.setattr(push_router, "CRON_SECRET", "s3cret")

        word = client.get(f"/api/lists/{biggest_builtin(client)['id']}/words").json()[0]
        conn = database.get_db()
        uid = current_user_id(client)
        conn.execute("INSERT INTO word_progress (word_id, mode, user_id) VALUES (?, ?, ?)",
                     (word["id"], "multiple_choice", uid))
        conn.execute(
            "UPDATE word_progress SET next_review_at = ? "
            "WHERE word_id = ? AND mode = ? AND user_id = ?",
            ("2020-01-01 00:00:00", word["id"], "multiple_choice", uid))
        conn.commit()
        conn.close()

        client.post("/api/push/subscribe", json={"endpoint": ENDPOINT})
        sent = []
        monkeypatch.setattr(push_router.push, "send_push", lambda e, **k: sent.append(e) or 201)

        body = client.post("/api/push/send-due", params={"key": "s3cret"}).json()
        assert body["due"] >= 1
        assert body["sent"] == 1
        assert sent == [ENDPOINT]
        client.post("/api/push/unsubscribe", json={"endpoint": ENDPOINT})

    def test_dead_subscriptions_are_pruned(self, client, keys, monkeypatch, db):
        """Browsers rotate endpoints; 404/410 means stop trying."""
        from routers import push as push_router
        monkeypatch.setattr(push_router, "CRON_SECRET", "s3cret")
        monkeypatch.setattr(push_router.push, "send_push", lambda e, **k: 410)

        client.post("/api/push/subscribe", json={"endpoint": ENDPOINT})
        body = client.post("/api/push/send-due", params={"key": "s3cret"}).json()

        assert body["pruned"] == 1
        remaining = db.execute(
            "SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?",
            (ENDPOINT,)).fetchone()["n"]
        assert remaining == 0

    def test_a_network_failure_keeps_the_subscription(self, client, keys, monkeypatch, db):
        from routers import push as push_router
        monkeypatch.setattr(push_router, "CRON_SECRET", "s3cret")
        monkeypatch.setattr(push_router.push, "send_push", lambda e, **k: 0)

        client.post("/api/push/subscribe", json={"endpoint": ENDPOINT})
        body = client.post("/api/push/send-due", params={"key": "s3cret"}).json()

        assert body["pruned"] == 0, "a transient failure discarded the subscription"
        remaining = db.execute(
            "SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?",
            (ENDPOINT,)).fetchone()["n"]
        assert remaining == 1
        client.post("/api/push/unsubscribe", json={"endpoint": ENDPOINT})
