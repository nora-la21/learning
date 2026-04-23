import hashlib
import os
import subprocess
import tempfile

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/api", tags=["tts"])

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "tts_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# espeak-ng voice name per language prefix
DEFAULT_VOICES: dict[str, str] = {
    "nl": "nl",
    "en": "mb-en1",
    "fr": "fr",
    "de": "de",
    "es": "es",
    "pt": "pt",
    "it": "it",
}

# Valid espeak-ng voice names we expose to clients
KNOWN_VOICES: set[str] = {
    "nl", "mb-nl2", "mb-nl3",
    "mb-en1", "en-us", "en-gb",
    "fr", "de", "es", "pt", "it",
}

ESPEAK_SPEED = 140


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

    # Reject old edge-tts neural voice names or anything unknown
    espeak_voice = voice if voice in KNOWN_VOICES else DEFAULT_VOICES.get(lang_prefix, "nl")

    cache_key = hashlib.md5(f"{espeak_voice}:{text}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.mp3")

    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        with open(cache_path, "rb") as f:
            return Response(
                content=f.read(),
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=31536000"},
            )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_tmp:
        wav_path = wav_tmp.name

    try:
        result = subprocess.run(
            ["espeak-ng", "-v", espeak_voice, "-s", str(ESPEAK_SPEED), "-w", wav_path, text],
            capture_output=True,
            timeout=15,
        )
        if result.returncode != 0:
            raise RuntimeError(f"espeak-ng failed: {result.stderr.decode()}")

        mp3_result = subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "4", cache_path],
            capture_output=True,
            timeout=15,
        )
        if mp3_result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {mp3_result.stderr.decode()}")

    except Exception as e:
        if os.path.exists(cache_path):
            os.remove(cache_path)
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

    with open(cache_path, "rb") as f:
        return Response(
            content=f.read(),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=31536000"},
        )
