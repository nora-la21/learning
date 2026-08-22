"""Typed answers must survive what a phone keyboard does to them.

iOS and Android substitute typography as you type. The learner sees exactly the
expected answer on screen and is told it is wrong, with no visible difference to
correct — the worst kind of wrong answer.
"""
import pytest

from services.game_engine import _normalize, _is_almost
from services.text_match import fold, loose


@pytest.mark.parametrize("typed, stored", [
    # The reported case: iOS turns "..." into one U+2026 character.
    ("ik ben… jaar oud", "ik ben... jaar oud"),
    ("ik ben... jaar oud", "ik ben… jaar oud"),
    # Curly apostrophes, which Dutch needs for 's ochtends and 't.
    ("’s ochtends", "'s ochtends"),
    ("'s ochtends", "’s ochtends"),
    ("het is ’n boek", "het is 'n boek"),
    # Curly quotes and dashes.
    ("“hallo”", '"hallo"'),
    ("een–twee", "een-twee"),
    ("een—twee", "een-twee"),
    # Non-breaking and narrow spaces.
    ("goede morgen", "goede morgen"),
    ("goede morgen", "goede morgen"),
    # A zero-width character pasted in from somewhere.
    ("dank​jewel", "dankjewel"),
    # Case and stray whitespace were already tolerated; keep them tolerated.
    ("  Ik Ben... Jaar Oud ", "ik ben... jaar oud"),
])
def test_typography_does_not_make_an_answer_wrong(typed, stored):
    assert _normalize(typed) == _normalize(stored)
    assert not _is_almost(typed, stored), "a correct answer must not be graded 'almost'"


@pytest.mark.parametrize("typed, stored", [
    ("ik ben jar oud", "ik ben... jaar oud"),
    ("de hond", "de hound"),
])
def test_a_genuine_typo_is_still_almost(typed, stored):
    assert _normalize(typed) != _normalize(stored)
    assert _is_almost(typed, stored)


@pytest.mark.parametrize("typed, stored", [
    ("iets heel anders", "ik ben... jaar oud"),
    ("kat", "hond"),
])
def test_a_wrong_answer_is_still_wrong(typed, stored):
    assert _normalize(typed) != _normalize(stored)
    assert not _is_almost(typed, stored)


def test_number_words_still_map_to_digits():
    assert _normalize("twenty") == "20"
    assert _normalize("One Hundred") == "100"


def test_fold_keeps_case_and_spacing_but_loose_does_not():
    assert fold("Ik Ben… Jaar") == "Ik Ben... Jaar"
    assert loose("  Ik   Ben… Jaar ") == "ik ben... jaar"


def test_folding_is_idempotent():
    once = fold("“Ik ben… ’t”")
    assert fold(once) == once
