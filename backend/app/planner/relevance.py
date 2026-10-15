"""Interest relevance. Pure, stdlib only.

Matching is whole-word and diacritic-insensitive ("bun" ~ "bún"), so "oc" does not hit
"học" and "che" does not hit "chè sầu"-style substrings by accident. Scores:
  3 = interest is a whole word/phrase inside a dish tag
  2 = interest is a whole word/phrase inside the venue name
  0 = no match
A venue's relevance is the sum over interests of the best score. Source tags are coarse
categories, so relevance is evidence of category fit, not a guarantee about specific dishes.
"""
from __future__ import annotations

import re
import unicodedata

from .types import Venue

_SYNONYMS = {
    "an vat": ("an vat", "an nhe"),
    "do ngot": ("che", "kem", "ngot"),
    "ca phe": ("ca phe", "cafe"),
    "tra sua": ("tra sua",),
}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _contains_phrase(haystack_tokens: list, phrase: str) -> bool:
    words = phrase.split()
    n = len(words)
    if n == 0:
        return False
    return any(haystack_tokens[i:i + n] == words for i in range(len(haystack_tokens) - n + 1))


def _phrases(interest: str) -> tuple:
    f = fold(interest)
    return _SYNONYMS.get(f, (f,)) if f else ()


def interest_score(v: Venue, interests: tuple) -> int:
    wanted = [i for i in interests if i and i.strip()]
    if not wanted:
        return 0
    tags = [fold(t).split() for t in v.dish_tags]
    name = fold(v.name).split()
    total = 0
    for interest in wanted:
        best = 0
        for phrase in _phrases(interest):
            if any(_contains_phrase(t, phrase) for t in tags):
                best = max(best, 3)
            elif _contains_phrase(name, phrase):
                best = max(best, 2)
        total += best
    return total


def excluded(v: Venue, exclusions: tuple) -> bool:
    items = [e for e in exclusions if e and e.strip()]
    if not items:
        return False
    tags = [fold(t).split() for t in v.dish_tags]
    name = fold(v.name).split()
    for e in items:
        for phrase in _phrases(e):
            if _contains_phrase(name, phrase) or any(_contains_phrase(t, phrase) for t in tags):
                return True
    return False
