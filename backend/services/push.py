"""Web Push, using only `cryptography`.

Pushes carry no payload. That is deliberate: an encrypted payload needs the
aes128gcm content-encoding (and the `http-ece` package, which builds from
source and has broken deploys before), whereas a bodyless push needs nothing
beyond a signed VAPID header. The service worker fetches the real numbers from
the API when it wakes, so the notification is still specific.

VAPID is RFC 8292: an ES256-signed JWT identifying this server to the push
service, plus the public key so it can verify.
"""
import base64
import json
import os
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:nobody@example.com").strip()

# Push services reject tokens valid for more than 24h.
TOKEN_LIFETIME_SECONDS = 12 * 60 * 60


def push_enabled() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def generate_keys() -> tuple[str, str]:
    """Create a VAPID keypair. Run once; keep the private half secret."""
    key = ec.generate_private_key(ec.SECP256R1())
    private_raw = key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return b64url_encode(public_raw), b64url_encode(private_raw)


def _load_private_key():
    value = int.from_bytes(b64url_decode(VAPID_PRIVATE_KEY), "big")
    return ec.derive_private_key(value, ec.SECP256R1())


def build_vapid_header(endpoint: str, now: int | None = None) -> str:
    """Authorization header proving this server owns the public key."""
    origin = urlparse(endpoint)
    audience = f"{origin.scheme}://{origin.netloc}"
    issued = int(time.time()) if now is None else now

    header = b64url_encode(json.dumps(
        {"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = b64url_encode(json.dumps({
        "aud": audience,
        "exp": issued + TOKEN_LIFETIME_SECONDS,
        "sub": VAPID_SUBJECT,
    }, separators=(",", ":")).encode())
    signing_input = f"{header}.{claims}".encode()

    der = _load_private_key().sign(signing_input, ec.ECDSA(hashes.SHA256()))
    # JWS wants the raw r||s pair, not the DER structure cryptography returns.
    r, s = decode_dss_signature(der)
    signature = b64url_encode(r.to_bytes(32, "big") + s.to_bytes(32, "big"))

    return f"vapid t={header}.{claims}.{signature}, k={VAPID_PUBLIC_KEY}"


def send_push(endpoint: str, ttl: int = 3600, timeout: int = 10) -> int:
    """Poke one subscription. Returns the push service's status code.

    404 and 410 mean the subscription is dead and should be dropped.
    """
    request = urllib.request.Request(
        endpoint,
        data=b"",
        method="POST",
        headers={
            "Authorization": build_vapid_header(endpoint),
            "TTL": str(ttl),
            "Content-Length": "0",
            # Required by some services even with an empty body.
            "Urgency": "normal",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0    # network failure; keep the subscription and retry tomorrow


if __name__ == "__main__":
    public, private = generate_keys()
    print("VAPID_PUBLIC_KEY=" + public)
    print("VAPID_PRIVATE_KEY=" + private)
