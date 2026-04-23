import base64
import hashlib
import os

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/api", tags=["tts"])

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tts_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

GOOGLE_TTS_KEY = os.environ.get("GOOGLE_TTS_KEY", "")

# Best available voice per language (Neural2 > WaveNet > Standard)
DEFAULT_VOICES: dict[str, str] = {
    "nl": "nl-NL-Neural2-A",
    "en": "en-US-Neural2-F",
    "fr": "fr-FR-Neural2-A",
    "de": "de-DE-Neural2-F",
    "es": "es-ES-Neural2-A",
    "pt": "pt-PT-Neural2-A",
    "it": "it-IT-Neural2-A",
}


@router.get("/tts/available")
def tts_available():
    return {"available": bool(GOOGLE_TTS_KEY)}


@router.get("/tts")
async def tts(
    text: str = Query(..., max_length=500),
    lang: str = Query("nl"),
    voice: str = Query(""),
):
    if not GOOGLE_TTS_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured — set GOOGLE_TTS_KEY")

    lang_prefix = lang.lower().split("-")[0]
    if not voice:
        voice = DEFAULT_VOICES.get(lang_prefix, "en-US-Neural2-F")

    # Derive language code from voice name: "nl-NL-Neural2-A" → "nl-NL"
    lang_code = "-".join(voice.split("-")[:2])

    cache_key = hashlib.md5(f"{voice}:{text}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.mp3")

    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(
                content=f.read(),
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=31536000"},
            )

    payload = {
        "input": {"text": text},
        "voice": {"languageCode": lang_code, "name": voice},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.9},
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={GOOGLE_TTS_KEY}",
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google TTS error: {resp.text}")

    audio_bytes = base64.b64decode(resp.json()["audioContent"])

    with open(cache_path, "wb") as f:
        f.write(audio_bytes)

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=31536000"},
    )
