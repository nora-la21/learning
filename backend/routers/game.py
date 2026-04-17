from fastapi import APIRouter, HTTPException
from models import (
    GameStartRequest, GameStartResponse,
    GameQuestion, GameAnswerRequest, GameAnswerResponse,
)
from services import game_engine
from services.progress_engine import update_word_progress

router = APIRouter(prefix="/api/game", tags=["game"])


@router.post("/start", response_model=GameStartResponse)
def start_game(body: GameStartRequest):
    try:
        session = game_engine.create_session(body.list_id, body.mode, body.session_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return GameStartResponse(
        session_id=session.session_id,
        total=len(session.word_ids),
        list_source_lang=session.source_lang,
        list_target_lang=session.target_lang,
    )


@router.get("/next", response_model=GameQuestion)
def next_question(session_id: str):
    question = game_engine.get_next_question(session_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Session complete or not found")
    return GameQuestion(**question)


@router.post("/answer", response_model=GameAnswerResponse)
def answer_question(body: GameAnswerRequest):
    try:
        result = game_engine.submit_answer(
            body.session_id, body.word_id, body.chosen, body.time_ms
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Determine mode from session
    session = game_engine._sessions.get(body.session_id)
    mode = session.mode if session else "multiple_choice"

    update_word_progress(body.word_id, result["correct"], body.time_ms, mode)
    return GameAnswerResponse(**result)
