import re
import random
import uuid
from dataclasses import dataclass, field
from typing import Optional
from database import get_db

_STRIP_PREFIXES = ("the ", "to ", "a ", "an ")

_ABSTRACT_KEYWORDS = frozenset([
    # pronouns
    "i", "you", "he", "she", "we", "they", "it",
    # question words
    "who", "what", "where", "when", "how", "why", "which",
    # demonstratives / locatives
    "this", "that", "here", "there",
    # indefinite pronouns
    "someone", "something", "nobody", "nothing", "everything", "everyone",
    # responses / fillers
    "yes", "no", "okay", "sorry", "welcome", "hello", "hi", "bye", "goodbye",
    "please", "congratulations", "cheers", "help",
    # time adverbs
    "always", "never", "sometimes", "often", "early", "late", "now", "later",
    "today", "tomorrow", "yesterday",
    # ordinals
    "first", "second", "third",
    # numbers
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty",
    "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",
    # days / months
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
    # seasons
    "spring", "summer", "autumn", "winter",
    # prepositions / conjunctions
    "in", "on", "at", "from", "by", "with", "without", "through", "over",
    "under", "above", "below", "between", "among", "around", "during", "until",
    "via", "per", "off", "inside", "outside", "opposite", "near", "far",
    "left", "right", "up", "down", "back", "north", "south", "east", "west",
    "forward", "along", "past", "against", "before", "after", "about",
    # abstract adjectives
    "good", "bad", "new", "old", "big", "small", "large", "long", "short",
    "fast", "slow", "easy", "difficult", "expensive", "cheap", "heavy", "light",
    "many", "few", "more", "less", "same", "different", "important", "interesting",
    "boring", "busy", "quiet", "dangerous", "safe", "clean", "dirty",
    "warm", "cold", "hot", "freezing", "sunny", "cloudy", "rainy",
    "sweet", "sour", "salty", "bitter", "spicy", "fresh", "frozen", "organic",
    "vegetarian", "funny", "serious", "honest", "smart", "creative", "patient",
    "impatient", "shy", "confident", "curious", "optimistic", "pessimistic",
    "friendly", "kind", "happy", "sad", "angry", "scared", "proud", "nervous",
    "lonely", "relaxed", "stressed", "healthy", "sick", "young",
    # abstract verbs (common infinitives stripped of "to ")
    "be", "have", "go", "come", "see", "hear", "know", "think", "want",
    "need", "can", "make", "say", "give", "take", "use", "find", "try",
    "allow", "begin", "stop", "open", "close", "forget", "understand",
    "talk", "walk", "work", "learn", "read", "write", "look", "listen",
    "help", "search", "pay", "call", "wait", "start", "ask", "tell",
    "laugh", "cry", "travel", "swim", "cook", "wear", "fit", "buy",
    "change", "decide", "choose", "plan", "check", "measure", "compare",
    "explain", "describe", "draw", "paint", "sing", "dance", "win", "lose",
    "practise", "repeat", "remember", "dream", "expect", "hope", "believe",
    "doubt", "accept", "refuse", "visit", "invite", "congratulate", "thank",
    # abstract nouns
    "time", "day", "week", "month", "year", "hour", "minute",
    "word", "question", "answer", "language", "world", "life",
    "beginning", "end", "direction", "distance", "number", "reason",
    "way", "part", "idea", "problem", "solution", "difference", "size",
    "pain", "allergy", "fever", "taste", "flavour", "portion", "tip",
    "traffic", "route", "salary", "holiday", "vacation", "subject",
    "lesson", "homework", "diploma", "internship", "application", "position",
    "department", "project", "deadline", "report", "assignment", "contract",
])


def _extract_image_keyword(target_word: str) -> Optional[str]:
    """Return a concrete image search keyword from an English translation, or None for abstract concepts."""
    word = target_word.strip().lower()
    for prefix in _STRIP_PREFIXES:
        if word.startswith(prefix):
            word = word[len(prefix):]
            break
    # Take the first word only (handles "man / husband", "informal", etc.)
    first = re.split(r"[\s/,\(\)]", word)[0].strip()
    if not first or len(first) < 3 or first in _ABSTRACT_KEYWORDS:
        return None
    return first

INDIVIDUAL_MODES = {"multiple_choice", "reverse_mc", "listening", "reverse_type_it"}

ALL_IN_ONE_SEQUENCE = ["multiple_choice", "reverse_mc", "listening", "reverse_type_it"]


@dataclass
class GameSession:
    session_id: str
    list_id: int
    all_modes: list
    current_mode_index: int
    base_word_ids: list
    word_queue: list
    wrong_this_pass: list
    correctly_done_this_mode: set = field(default_factory=set)
    streak: int = 0
    xp: int = 0
    source_lang: str = "nl"
    target_lang: str = "en"

    @property
    def mode(self) -> str:
        if self.current_mode_index >= len(self.all_modes):
            return self.all_modes[-1]
        return self.all_modes[self.current_mode_index]

    @property
    def total(self) -> int:
        return len(self.all_modes) * len(self.base_word_ids)

    @property
    def progress(self) -> int:
        return self.current_mode_index * len(self.base_word_ids) + len(self.correctly_done_this_mode)

    @property
    def is_complete(self) -> bool:
        return self.current_mode_index >= len(self.all_modes)


_sessions: dict[str, GameSession] = {}


def create_session(list_id: int, mode: str, session_size: int) -> GameSession:
    if mode not in INDIVIDUAL_MODES and mode != "all_in_one":
        raise ValueError(f"Invalid mode: {mode}")

    conn = get_db()
    list_row = conn.execute(
        "SELECT source_lang, target_lang FROM word_lists WHERE id = ?", (list_id,)
    ).fetchone()
    if not list_row:
        conn.close()
        raise ValueError("Word list not found")

    if mode == "all_in_one":
        all_words = conn.execute(
            "SELECT w.id, "
            "COALESCE(SUM(wp.correct_count + wp.incorrect_count), 0) as times_seen, "
            "SUM(CASE WHEN wp.mastered = 1 THEN 1 ELSE 0 END) as modes_mastered "
            "FROM words w "
            "LEFT JOIN word_progress wp ON wp.word_id = w.id "
            "WHERE w.list_id = ? AND w.manually_excluded = 0 "
            "GROUP BY w.id",
            (list_id,),
        ).fetchall()
        conn.close()
        buckets: dict[tuple, list] = {}
        for row in all_words:
            key = (1 if row["modes_mastered"] >= 4 else 0, row["times_seen"])
            buckets.setdefault(key, []).append(row["id"])
    else:
        all_words = conn.execute(
            "SELECT w.id, "
            "COALESCE(wp.correct_count + wp.incorrect_count, 0) as times_seen, "
            "COALESCE(wp.mastered, 0) as mastered "
            "FROM words w "
            "LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.mode = ? "
            "WHERE w.list_id = ? AND w.manually_excluded = 0",
            (mode, list_id),
        ).fetchall()
        conn.close()
        buckets = {}
        for row in all_words:
            key = (row["mastered"], row["times_seen"])
            buckets.setdefault(key, []).append(row["id"])

    # Sort buckets: mastered=0 before mastered=1, fewer attempts first within each
    pool: list[int] = []
    for key in sorted(buckets.keys()):
        group = buckets[key]
        random.shuffle(group)
        pool.extend(group)

    if len(pool) < 4:
        raise ValueError("Need at least 4 words to start a session")

    size = min(session_size, len(pool))
    unique = pool[:size]
    random.shuffle(unique)

    all_modes = ALL_IN_ONE_SEQUENCE if mode == "all_in_one" else [mode]

    session_id = str(uuid.uuid4())
    session = GameSession(
        session_id=session_id,
        list_id=list_id,
        all_modes=all_modes,
        current_mode_index=0,
        base_word_ids=unique[:],
        word_queue=unique[:],
        wrong_this_pass=[],
        correctly_done_this_mode=set(),
        source_lang=list_row["source_lang"],
        target_lang=list_row["target_lang"],
    )
    _sessions[session_id] = session
    return session


def get_next_question(session_id: str) -> Optional[dict]:
    session = _sessions.get(session_id)
    if not session or session.is_complete:
        return None
    if not session.word_queue:
        return None

    word_id = session.word_queue[0]
    conn = get_db()
    word = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    if not word:
        conn.close()
        return None

    all_words = conn.execute(
        "SELECT source_word, target_word FROM words WHERE list_id = ? AND id != ?",
        (session.list_id, word_id),
    ).fetchall()
    conn.close()

    mode = session.mode
    question_id = str(uuid.uuid4())
    is_retry = word_id not in session.correctly_done_this_mode and word_id in session.wrong_this_pass or \
               (word_id not in session.base_word_ids[:session.base_word_ids.index(word_id) + 1]
                if word_id in session.base_word_ids else False)
    # simpler: is_retry if this word has already been seen wrong this pass
    is_retry = word_id in session.wrong_this_pass

    if mode == "multiple_choice":
        prompt = word["source_word"]
        prompt_lang = session.source_lang
        pool = [r["target_word"] for r in all_words]
        options = _build_options(word["target_word"], pool)
        option_langs = [session.target_lang] * len(options)

    elif mode == "reverse_mc":
        prompt = word["target_word"]
        prompt_lang = session.target_lang
        pool = [r["source_word"] for r in all_words]
        options = _build_options(word["source_word"], pool)
        option_langs = [session.source_lang] * len(options)

    elif mode == "listening":
        prompt = word["source_word"]
        prompt_lang = session.source_lang
        pool = [r["target_word"] for r in all_words]
        options = _build_options(word["target_word"], pool)
        option_langs = [session.target_lang] * len(options)

    elif mode == "type_it":
        prompt = word["source_word"]
        prompt_lang = session.source_lang
        options = None
        option_langs = None

    else:  # reverse_type_it
        prompt = word["target_word"]
        prompt_lang = session.target_lang
        options = None
        option_langs = None

    return {
        "question_id": question_id,
        "word_id": word_id,
        "prompt": prompt,
        "prompt_lang": prompt_lang,
        "options": options,
        "mode": mode,
        "source_lang": session.source_lang,
        "target_lang": session.target_lang,
        "option_langs": option_langs,
        "is_retry": is_retry,
        "mode_index": session.current_mode_index,
        "total_modes": len(session.all_modes),
        "image_keyword": _extract_image_keyword(word["target_word"]),
    }


def submit_answer(session_id: str, word_id: int, chosen: str, time_ms: int) -> dict:
    session = _sessions.get(session_id)
    if not session:
        raise ValueError("Session not found")

    conn = get_db()
    word = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
    if not word:
        conn.close()
        raise ValueError("Word not found")

    mode = session.mode
    if mode in ("multiple_choice", "type_it", "listening"):
        correct_answer = word["target_word"]
    else:  # reverse_mc, reverse_type_it
        correct_answer = word["source_word"]

    correct = _normalize(chosen) == _normalize(correct_answer)
    almost = not correct and _is_almost(chosen, correct_answer)

    # Pop from front of queue
    if session.word_queue and session.word_queue[0] == word_id:
        session.word_queue.pop(0)

    if correct:
        session.streak += 1
        xp = 10 + min(session.streak * 2, 20)
        session.correctly_done_this_mode.add(word_id)
        # Remove from wrong_this_pass if it was there (now correct)
        if word_id in session.wrong_this_pass:
            session.wrong_this_pass.remove(word_id)
    else:
        session.streak = 0
        xp = 0
        # Add back to retry queue (at the end)
        if word_id not in session.wrong_this_pass:
            session.wrong_this_pass.append(word_id)
        session.word_queue.append(word_id)

    session.xp += xp

    mode_complete = False
    new_mode = None

    # Check if we just finished this mode (queue empty and no pending wrong words)
    if not session.word_queue:
        # All words answered correctly for this mode
        session.current_mode_index += 1
        session.wrong_this_pass = []
        session.correctly_done_this_mode = set()
        mode_complete = True

        if not session.is_complete:
            session.word_queue = session.base_word_ids[:]
            new_mode = session.mode

    conn.close()
    return {
        "correct": correct,
        "almost": almost,
        "correct_answer": correct_answer,
        "xp_gained": xp,
        "streak": session.streak,
        "progress_index": session.progress,
        "total": session.total,
        "mode_complete": mode_complete,
        "new_mode": new_mode,
        "mode_index": session.current_mode_index,
        "total_modes": len(session.all_modes),
        "answered_mode": mode,
    }


def _build_options(correct: str, pool: list[str]) -> list[str]:
    distractors = _generate_distractors(correct, pool)
    options = distractors + [correct]
    random.shuffle(options)
    return options


def _generate_distractors(correct: str, pool: list[str], n: int = 3) -> list[str]:
    candidates = [w for w in pool if w.lower() != correct.lower()]
    similar = [w for w in candidates if abs(len(w) - len(correct)) <= 2]
    other = [w for w in candidates if w not in similar]
    random.shuffle(similar)
    random.shuffle(other)
    return (similar + other)[:n]


_NUMBER_WORDS: dict[str, str] = {
    "one thousand": "1000",
    "one hundred": "100",
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
    "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000",
}


def _normalize(text: str) -> str:
    """Normalize for comparison: lowercase, strip commas/periods, map number words to digits."""
    t = re.sub(r"[,\.]+", "", text.strip().lower()).strip()
    t = re.sub(r"\s+", " ", t)
    return _NUMBER_WORDS.get(t, t)


def _is_almost(chosen: str, correct: str) -> bool:
    a = _normalize(chosen)
    b = _normalize(correct)
    if a == b or not a or not b:
        return False
    if abs(len(a) - len(b)) > 2:
        return False
    return _levenshtein(a, b) == 1


def _levenshtein(a: str, b: str) -> int:
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        dp[i][0] = i
    for j in range(len(b) + 1):
        dp[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[len(a)][len(b)]


def _now_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
