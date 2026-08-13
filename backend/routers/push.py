"""Push subscription management and the daily nudge.

Nothing here runs on a timer: a free-tier host sleeps, so it cannot wake itself.
An external scheduler calls /send-due, which is why that endpoint is guarded by
a shared secret rather than left open.
"""
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from routers.auth import current_user
from services import push

router = APIRouter(prefix="/api/push", tags=["push"])

CRON_SECRET = os.environ.get("CRON_SECRET", "").strip()

DEAD_SUBSCRIPTION_CODES = {404, 410}


class SubscribeRequest(BaseModel):
    endpoint: str


@router.get("/config")
def push_config():
    """The browser needs the public key to subscribe."""
    return {"enabled": push.push_enabled(), "public_key": push.VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=204)
def subscribe(body: SubscribeRequest, user=Depends(current_user)):
    if not push.push_enabled():
        raise HTTPException(status_code=501, detail="Push notifications are not configured")
    endpoint = body.endpoint.strip()
    if not endpoint.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid subscription endpoint")
    conn = get_db()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO push_subscriptions (endpoint, user_id) VALUES (?, ?)",
            (endpoint, user["id"]))
        conn.commit()
    finally:
        conn.close()


@router.post("/unsubscribe", status_code=204)
def unsubscribe(body: SubscribeRequest, user=Depends(current_user)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
                     (body.endpoint.strip(), user["id"]))
        conn.commit()
    finally:
        conn.close()


@router.post("/send-due")
def send_due(key: str = ""):
    """Notify every subscriber if anything is due. Called by an external cron."""
    if not CRON_SECRET or key != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Invalid key")
    if not push.push_enabled():
        raise HTTPException(status_code=501, detail="Push notifications are not configured")

    conn = get_db()
    try:
        # Due counts are per account, so only notify people who actually have
        # something waiting rather than everyone whenever anyone does.
        rows = conn.execute(
            "SELECT s.endpoint FROM push_subscriptions s WHERE EXISTS ("
            "  SELECT 1 FROM word_progress wp "
            "  LEFT JOIN user_word_flags f ON f.word_id = wp.word_id AND f.user_id = wp.user_id "
            "  WHERE wp.user_id = s.user_id AND COALESCE(f.known, 0) = 0 "
            "    AND wp.next_review_at <= datetime('now')"
            ")"
        ).fetchall()
        endpoints = [r["endpoint"] for r in rows]
        due = len(endpoints)
        if not endpoints:
            return {"due": 0, "sent": 0, "pruned": 0}
    finally:
        conn.close()

    sent, dead = 0, []
    for endpoint in endpoints:
        status = push.send_push(endpoint)
        if status in DEAD_SUBSCRIPTION_CODES:
            dead.append(endpoint)
        elif 200 <= status < 300:
            sent += 1

    if dead:
        conn = get_db()
        try:
            # Browsers rotate endpoints; keeping dead ones means retrying forever.
            ph = ','.join('?' * len(dead))
            conn.execute(f"DELETE FROM push_subscriptions WHERE endpoint IN ({ph})", tuple(dead))
            conn.commit()
        finally:
            conn.close()

    return {"due": due, "sent": sent, "pruned": len(dead)}
