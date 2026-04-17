from pydantic import BaseModel
from typing import Optional


class WordPair(BaseModel):
    source_word: str
    target_word: str


class WordListCreate(BaseModel):
    name: str
    source_lang: str = "nl"
    target_lang: str = "en"


class WordListResponse(BaseModel):
    id: int
    name: str
    source_lang: str
    target_lang: str
    source_file: Optional[str] = None
    builtin: int = 0
    created_at: str
    word_count: int = 0


class WordResponse(BaseModel):
    id: int
    list_id: int
    source_word: str
    target_word: str
    created_at: str


class WordUpdate(BaseModel):
    source_word: Optional[str] = None
    target_word: Optional[str] = None


class UploadPreview(BaseModel):
    filename: str
    words: list[WordPair]
    word_count: int


class UploadConfirm(BaseModel):
    list_name: str
    source_lang: str = "nl"
    target_lang: str = "en"
    source_file: Optional[str] = None
    words: list[WordPair]


class UploadConfirmResponse(BaseModel):
    list_id: int
    word_count: int


class GameStartRequest(BaseModel):
    list_id: int
    mode: str
    session_size: int = 20


class GameStartResponse(BaseModel):
    session_id: str
    total: int
    list_source_lang: str
    list_target_lang: str
    all_modes: list[str]


class GameQuestion(BaseModel):
    question_id: str
    word_id: int
    prompt: str
    prompt_lang: str
    options: Optional[list[str]]
    mode: str
    source_lang: str
    target_lang: str
    option_langs: Optional[list[str]] = None
    is_retry: bool = False
    mode_index: int = 0
    total_modes: int = 1


class GameAnswerRequest(BaseModel):
    session_id: str
    word_id: int
    chosen: str
    time_ms: int


class GameAnswerResponse(BaseModel):
    correct: bool
    almost: bool = False
    correct_answer: str
    xp_gained: int
    streak: int
    progress_index: int
    total: int
    mode_complete: bool = False
    new_mode: Optional[str] = None
    mode_index: int = 0
    total_modes: int = 1


class ProgressSummary(BaseModel):
    total_words: int
    mastered: int
    in_progress: int
    not_started: int
    due_today: int
    accuracy_7d: Optional[float]
    current_streak: int


class WordProgressDetail(BaseModel):
    word_id: int
    source_word: str
    target_word: str
    repetitions: int
    ease_factor: float
    interval_days: int
    next_review_at: str
    mastered: bool
    correct_count: int
    incorrect_count: int


class HeatmapEntry(BaseModel):
    date: str
    count: int
