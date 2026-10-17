"""Conservative allergen vocabulary (hotfix C0-HF; to be extended by C2).

Honesty rules (docs/CHATBOT_UPGRADE_PLAN.vi.md 3.6): the dataset has NO ingredient/menu/allergen data, so
no venue is ever "safe". This module only decides which venues are *excluded because their name or dish
groups point at the allergen*; every remaining venue is still "ingredients unknown".
"""
from __future__ import annotations

from .relevance import fold, fold_uncached
from .types import Venue

# family -> (user words, venue name/dish-group phrases that may contain the allergen)
FAMILIES = {
    "crustacean": (("cua", "ghe", "tom", "tom hum", "tep", "giap xac"),
                   ("cua", "ghe", "tom", "tep", "hai san", "lau hai san")),
    "mollusc": (("so", "oc", "ngheu", "hen", "hau", "muc", "bach tuoc", "nhuyen the"),
                ("so", "oc", "ngheu", "hen", "hau", "muc", "bach tuoc", "hai san")),
    "seafood": (("hai san",),
                ("hai san", "cua", "ghe", "tom", "tep", "so", "oc", "ngheu", "hen", "hau", "muc", "bach tuoc",
                 "bun ca", "cha ca", "ca kho", "ca nuong", "lau ca")),
    "fish": (("ca", "mon ca"),
             ("hai san", "bun ca", "cha ca", "ca kho", "ca nuong", "ca chien", "lau ca", "ca vien")),
    "peanut": (("dau phong", "lac", "dau phung"), ("dau phong", "lac")),
    "dairy": (("sua", "pho mai", "phomai", "lactose", "bo sua"), ("sua", "pho mai", "phomai", "kem", "tra sua")),
    "egg": (("trung",), ("trung", "flan", "banh flan", "egg coffee", "ca phe trung", "op la")),
    "gluten": (("gluten", "lua mi", "bot mi"), ("banh mi", "mi", "pizza", "burger", "banh ngot", "tiem banh")),
    "soy": (("dau nanh", "dau phu", "dau hu"), ("dau phu", "dau hu", "dau nanh", "sua dau nanh")),
    "sesame": (("me", "vung", "me den"), ("me", "vung", "xoi vung", "che vung")),
    "treenut": (("hat dieu", "hanh nhan", "oc cho", "mac ca", "hat de", "hat phi", "hat"), ("hat dieu", "hanh nhan", "oc cho", "mac ca", "hat de", "che hat")),
}
_BY_WORD = {w: fam for fam, (words, _) in FAMILIES.items() for w in words}
MAX_TERMS = 10
MAX_TERM_CHARS = 40


def family_of(term: str):
    """Family of a user term; multi-word terms ("sữa bò") match on their longest known phrase."""
    words = fold_uncached(term).split()
    low = term.casefold()
    for size in range(len(words), 0, -1):
        for i in range(len(words) - size + 1):
            phrase = " ".join(words[i:i + size])
            fam = _BY_WORD.get(phrase)
            if fam == "sesame" and phrase == "me" and "mè" not in low:
                continue  # "mẹ" (mother) and "mê" (to love) fold to "me": only the accented mè is sesame
            if fam == "treenut" and phrase == "hat" and "hạt" not in low:
                continue  # "hát" (to sing) folds to "hat": only the accented hạt (nuts/seeds) counts
            if fam:
                return fam
    return None


def recognised(term: str) -> bool:
    return family_of(term) is not None


def _phrase_in(tokens: list, phrase: str) -> bool:
    words = phrase.split()
    n = len(words)
    return n > 0 and any(tokens[i:i + n] == words for i in range(len(tokens) - n + 1))


def allergen_excluded(v: Venue, allergies: tuple) -> bool:
    """True when the venue name or a dish group points at an allergen the user reported."""
    if not allergies:
        return False
    texts = [fold(v.name).split()] + [fold(t).split() for t in v.dish_tags]
    for term in allergies:
        folded = fold_uncached(term)
        if not folded:
            continue
        fam = family_of(folded)
        phrases = FAMILIES[fam][1] if fam else (folded,)
        if any(_phrase_in(tokens, p) for tokens in texts for p in phrases):
            return True
    return False


def unrecognised(allergies: tuple) -> list:
    return [a for a in allergies if not recognised(a)]


def core_term(term: str):
    """Longest lexicon phrase inside a user term, keeping the user's own spelling ("nhẹ cua" -> "cua")."""
    words = term.split()
    folded = [fold_uncached(w) for w in words]
    for size in range(len(words), 0, -1):
        for i in range(len(words) - size + 1):
            if " ".join(folded[i:i + size]) in _BY_WORD:
                return " ".join(words[i:i + size])
    return None
