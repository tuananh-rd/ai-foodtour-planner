"""Interest relevance. Pure, stdlib only.

Matching is whole-word and diacritic-insensitive ("bun" ~ "bún"), so "oc" does not hit
"học". Note whole-token "che" does match a longer tag such as "che sau"; that is intended. Scores:
  3 = interest is a whole word/phrase inside a dish tag
  2 = interest is a whole word/phrase inside the venue name
  0 = no match
A venue's relevance is the sum over interests of the best score. Source tags are coarse
categories, so relevance is evidence of category fit, not a guarantee about specific dishes.
"""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

from .types import Venue

_SYNONYMS = {
    "an vat": ("an vat", "an nhe"),
    "do ngot": ("che", "kem", "ngot"),
    "ca phe": ("ca phe", "cafe"),
    "tra sua": ("tra sua",),
}
_COMBINING = re.compile(r"[\u0300-\u036f]")
_NON_WORD = re.compile(r"[^a-z0-9]+")


@lru_cache(maxsize=8192)
def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    # Vietnamese decomposes into ASCII + this combining block. Keep the general
    # Unicode fallback while avoiding a Python character loop for common inputs.
    text = _COMBINING.sub("", text)
    if not text.isascii():
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return _NON_WORD.sub(" ", text).strip()


# Uncached variant for user-supplied text: never memoise private chat messages in the global LRU.
fold_uncached = fold.__wrapped__


def _contains_phrase(haystack: str, phrase: str) -> bool:
    # Fold produces single-space-separated words; padding preserves whole-word semantics.
    return bool(phrase) and f" {phrase} " in haystack


def _phrases(interest: str) -> tuple:
    f = fold_uncached(interest)
    return _SYNONYMS.get(f, (f,)) if f else ()


def interest_score(v: Venue, interests: tuple) -> int:
    wanted = [i for i in interests if i and i.strip()]
    if not wanted:
        return 0
    # A slash cannot occur in folded text, so phrases cannot cross tag boundaries.
    tags = " " + " / ".join(fold(t) for t in v.dish_tags) + " "
    name = f" {fold(v.name)} "
    total = 0
    for interest in wanted:
        best = 0
        for phrase in _phrases(interest):
            if _contains_phrase(tags, phrase):
                best = max(best, 3)
            elif _contains_phrase(name, phrase):
                best = max(best, 2)
        total += best
    return total


def excluded(v: Venue, exclusions: tuple) -> bool:
    items = [e for e in exclusions if e and e.strip()]
    if not items:
        return False
    tags = " " + " / ".join(fold(t) for t in v.dish_tags) + " "
    name = f" {fold(v.name)} "
    for e in items:
        for phrase in _phrases(e):
            if _contains_phrase(name, phrase) or _contains_phrase(tags, phrase):
                return True
    return False
