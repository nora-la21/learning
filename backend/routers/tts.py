import asyncio
import hashlib
import os
import ssl

import edge_tts
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

# The server's SSL chain can't verify Microsoft's TTS endpoint in this environment
ssl._create_default_https_context = ssl._create_unverified_context

router = APIRouter(prefix="/api", tags=["tts"])

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tts_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

DEFAULT_VOICES: dict[str, str] = {
    "nl": "nl-NL-ColetteNeural",
    "en": "en-US-JennyNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "pt": "pt-PT-RaquelNeural",
    "it": "it-IT-ElsaNeural",
}


@router.get("/tts/available")
def tts_available():
    return {"available": True}


@router.get("/tts")
async def tts(
    text: str = Query(..., max_length=500),
    lang: str = Query("nl"),
    voice: str = Query(""),
):
    lang_prefix = lang.lower().split("-")[0]
    if not voice:
        voice = DEFAULT_VOICES.get(lang_prefix, "en-US-JennyNeural")

    cache_key = hashlib.md5(f"{voice}:{text}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.mp3")

    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        with open(cache_path, "rb") as f:
            return Response(
                content=f.read(),
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=31536000"},
            )

    last_error: Exception | None = None
    for attempt in range(3):
        if attempt > 0:
            await asyncio.sleep(0.3 * attempt)  # 0.3s, then 0.6s between retries
        tmp_path = cache_path + f".tmp{attempt}"
        try:
            communicate = edge_tts.Communicate(text, voice, rate="-10%")
            await communicate.save(tmp_path)
            if os.path.getsize(tmp_path) > 0:
                os.replace(tmp_path, cache_path)
                break
            os.remove(tmp_path)
            last_error = RuntimeError("empty response from TTS")
        except Exception as e:
            last_error = e
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    else:
        raise HTTPException(status_code=502, detail=f"TTS error after retries: {last_error}")

    with open(cache_path, "rb") as f:
        return Response(
            content=f.read(),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=31536000"},
        )
