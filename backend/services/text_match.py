"""Folding typed answers so that a keyboard's autocorrect cannot mark them wrong.

Mobile keyboards substitute typography as you type: iOS turns "..." into a single
U+2026 ellipsis and "'" into a curly U+2019 apostrophe, Android and desktop word
processors do the same. The learner sees exactly the expected answer on screen and
is told it is wrong, which is the most demoralising possible failure — they cannot
see the difference, so they cannot correct it.

NFKC does most of the work (it decomposes the ellipsis back to three periods and
turns a non-breaking space into a normal one) but deliberately leaves quotation
marks and dashes alone, so those are mapped by hand.
"""
import re
import unicodedata

# What NFKC will not do for us. Curly quotes matter for Dutch, which writes
# 's ochtends and 't with a leading apostrophe.
_TYPOGRAPHY = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "´": "'", "`": "'", "ʼ": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "–": "-", "—": "-", "―": "-", "−": "-",
    " ": " ", " ": " ", " ": " ", " ": " ",
    "​": "", "‌": "", "‍": "", "﻿": "",
})


def fold(text: str) -> str:
    """Typography-insensitive form of a typed answer. Case and spacing survive."""
    return unicodedata.normalize("NFKC", text).translate(_TYPOGRAPHY)


def loose(text: str) -> str:
    """fold(), plus lowercasing and collapsed whitespace — for comparing answers."""
    return re.sub(r"\s+", " ", fold(text).strip().lower())
