import hashlib
import os

import edge_tts
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

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

    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(
                content=f.read(),
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=31536000"},
            )

    try:
        communicate = edge_tts.Communicate(text, voice, rate="-10%")
        await communicate.save(cache_path)
    except Exception as e:
        # Clean up empty cache file if save failed partway
        if os.path.exists(cache_path):
            os.remove(cache_path)
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")

    with open(cache_path, "rb") as f:
        return Response(
            content=f.read(),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=31536000"},
        )
