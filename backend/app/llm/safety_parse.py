"""Clause-based parser for allergy / avoidance statements (C0-HF round 3).

Design: normalise (NFC, no format chars), split into clauses, handle each clause's own trigger and local negation,
let bare allergen words continue a list ("dị ứng cua, tôm và sữa"), and NEVER drop a statement silently: anything that
cannot be turned into a concrete term becomes an *issue* the caller must answer with a clarification.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from app.planner import allergens
from app.planner.relevance import fold_uncached

_CLAUSE_SPLIT = re.compile(r"[,;.!?\n]+|\s+(?:và|va|nhưng|nhung|mà|ma|còn|con|hoặc|hoac)\s+")
_ALLERGY = re.compile(r"(?:dị ứng|di ung)")
_AVOID = re.compile(r"(?:không|khong|ko)\s+(?:thể\s+|the\s+)?(?:ăn|an)(?:\s+(?:được|duoc))?|kiêng|kieng")
_NEG = re.compile(r"(?:không hề|khong he|không bao giờ|khong bao gio|chưa từng|chua tung|chưa bao giờ|"
                  r"không|khong|chẳng|chang|chưa|chua|ko|hết|het)\s*(?:còn|con|bị|bi|có|co)?\s*$")
_REMOVE = re.compile(r"(?:hết|het|không còn|khong con|chẳng còn|chang con)\s*(?:bị |bi )?$")
_TAGS = re.compile(r"<[^>]*>")
_SEVERITY = {"nhẹ", "nhe", "nặng", "nang", "vừa", "vua", "ít", "it", "lắm", "lam", "rất", "rat", "hơi", "hoi",
             "một", "mot", "chút", "chut", "bị", "bi", "với", "voi", "gì", "gi", "cả", "ca"}
_FILLER = {"các", "cac", "món", "mon", "đồ", "do", "những", "nhung", "loại", "loai", "thịt", "thit", "nữa", "nua",
           "nhé", "nhe", "nha", "thôi", "thoi", "ạ", "đấy", "luôn", "luon", "rồi", "roi", "xong", "đó"}
_RELATION = {"nhau", "bạn", "ban", "người", "nguoi", "mình", "minh", "tôi", "toi", "họ", "ho", "ai", "mỗi", "moi",
             "mọi", "moi", "khác", "khac", "của", "cùa"}
_STOP = re.compile(r"\d|\bk\b|đồng|dong|ngân|ngan|tiền|tien|nhóm|nhom")
_EXAMPLE = re.compile(r"(?:ví dụ|vi du|vd|example)")
_QUOTE = re.compile(r"[\"“”'‘’«»]")
_AMBIGUOUS_RAW = {"của", "cùa", "cúa"}  # "của" (of) folds to "cua" (crab)
MAX_SCAN_WORDS = 8


def normalize_keep_case(text: str) -> str:
    """NFC + drop control/format characters (zero-width etc.) so equivalent inputs behave identically."""
    text = unicodedata.normalize("NFC", text)
    ws = (chr(10), chr(9))
    return "".join(" " if ch in ws else ch for ch in text if ch in ws or unicodedata.category(ch) not in ("Cf", "Cc"))


def normalize(text: str) -> str:
    return " ".join(normalize_keep_case(text).casefold().split())


@dataclass
class SafetyParse:
    allergies: list = field(default_factory=list)
    removed: list = field(default_factory=list)
    avoid: list = field(default_factory=list)
    issues: list = field(default_factory=list)  # empty | long | people | example
    mentioned: bool = False                       # some allergy/avoidance trigger was seen (even if negated)


def _scan(words: list) -> tuple:
    """Lexicon phrases in `words` (longest first). Returns (found_phrases, all_words_consumed)."""
    found, used, i = [], 0, 0
    n = min(len(words), MAX_SCAN_WORDS)
    while i < n:
        hit = 0
        for size in range(min(3, n - i), 0, -1):
            chunk = words[i:i + size]
            if size == 1 and chunk[0] in _AMBIGUOUS_RAW:
                break
            if allergens.family_of(" ".join(chunk)) and allergens.core_term(" ".join(chunk)) == " ".join(chunk):
                hit = size
                break
        if hit:
            found.append(" ".join(words[i:i + hit]))
            used += hit
            i += hit
        else:
            i += 1
    return found, used == len(words)


def _clean_words(rest: str) -> list:
    rest = _TAGS.sub(" ", rest)
    rest = re.sub(r"[^\w\s-]", " ", rest)
    return [w for w in rest.split() if w]


def _terms(rest: str, issues: list) -> tuple:
    words = _clean_words(rest)
    found, _ = _scan(words)
    if found:
        return found, True
    core = [w for w in words if w not in _SEVERITY and w not in _FILLER]
    if not core:
        issues.append("empty")
        return [], False
    if any(w in _RELATION for w in core):
        issues.append("people")
        return [], False
    cand = " ".join(core)
    if _STOP.search(cand):
        issues.append("empty")
        return [], False
    if len(core) > 3 or len(cand) > allergens.MAX_TERM_CHARS:
        issues.append("long")
        return [], False
    return [cand], False


def parse(text: str) -> SafetyParse:
    out = SafetyParse()
    text = normalize(text)
    if _QUOTE.search(text) and _EXAMPLE.search(text) and _ALLERGY.search(text):
        out.mentioned = True
        out.issues.append("example")
        return out
    mode = None  # "allergy" | "avoid" | None  (list continuation)
    for clause in _CLAUSE_SPLIT.split(text):
        clause = clause.strip()
        if not clause:
            continue
        a, v = _ALLERGY.search(clause), _AVOID.search(clause)
        m = a if (a and (not v or a.start() <= v.start())) else v
        if m:
            kind = "allergy" if m is a else "avoid"
            out.mentioned = True
            before = clause[max(0, m.start() - 24):m.start()]
            if kind == "allergy" and _REMOVE.search(before):
                terms, _ = _terms(clause[m.end():], [])
                out.removed += [t for t in terms if t not in out.removed]
                mode = None
                continue
            if _NEG.search(before) and kind == "allergy":
                mode = None  # "không (hề) bị dị ứng …": states absence; nothing to record
                continue
            terms, lexicon = _terms(clause[m.end():], out.issues)
            if kind == "avoid":
                terms = [t for t in terms if allergens.recognised(t)]  # taste-level avoid: lexicon terms only
            bucket = out.allergies if kind == "allergy" else out.avoid
            bucket += [t for t in terms if t not in bucket]
            mode = kind if terms else None
            continue
        if mode:  # continuation: a clause made only of allergen words extends the previous list
            found, all_used = _scan(_clean_words(clause))
            if found and all_used:
                bucket = out.allergies if mode == "allergy" else out.avoid
                bucket += [t for t in found if t not in bucket]
                continue
        mode = None
    return out
