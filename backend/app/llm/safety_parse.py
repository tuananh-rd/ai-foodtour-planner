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
_AVOID = re.compile(r"(?:không|khong|ko)\s+(?:thể\s+|the\s+)?(?:ăn|an)(?:\s+(?:được|duoc))?|kiêng|kieng|tránh|tranh|"
                    r"đừng\s+(?:cho|ăn|lấy)|dung\s+(?:cho|an|lay)|ghét|ghet|né|không chọn món(?: có)?|khong chon mon(?: co)?|không lấy món(?: có)?")
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
    negated: bool = False                          # "không (bị) dị ứng …": an explicit absence statement
    avoid_any: list = field(default_factory=list)  # taste-level avoid terms, lexicon or not (<=3 words)


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


_TAIL_STOP = {"vao", "trong", "nha", "nhe", "nhen", "giup", "dum", "vi", "boi", "do", "hom", "nua", "di", "a", "ạ", "nhé", "nghen", "với",
              "voi", "cho", "phan", "luon", "thoi", "nua", "suot", "chuyen", "toan", "het", "dip", "tuan", "ngay"}


def _cut_tail(rest: str) -> str:
    out = []
    for w in _clean_words(rest):
        if fold_uncached(w) in _TAIL_STOP or w in _TAIL_STOP:
            break
        out.append(w)
    return " ".join(out)


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


_AMBIGUOUS_UNACCENTED = {"ca", "so", "oc", "hen", "hau", "muc"}  # "cả nhóm", "số", "ốc"... when typed without accents


def _triggers(clause: str) -> list:
    """All (kind, match) triggers in a clause, in order, without overlaps."""
    found = [("allergy", m) for m in _ALLERGY.finditer(clause)] + [("avoid", m) for m in _AVOID.finditer(clause)]
    found.sort(key=lambda km: km[1].start())
    out, end = [], -1
    for kind, m in found:
        if m.start() >= end:
            out.append((kind, m))
            end = m.end()
    return out


def _continuation(clause: str) -> list:
    """A clause that STARTS with allergen words (and no trigger) extends the previous list: "…cua và tôm 4 người"."""
    words = _clean_words(clause)
    found, _ = _scan(words)
    if not found:
        return []
    first = found[0].split()
    if words[:len(first)] != first:
        return []
    keep = []
    for f in found:
        raw_ascii = f.isascii()
        if raw_ascii and fold_uncached(f) in _AMBIGUOUS_UNACCENTED:
            continue
        keep.append(f)
    return keep if keep and keep[0] == found[0] else []


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
        trig = _triggers(clause)
        if trig:
            for i, (kind, m) in enumerate(trig):
                seg_end = trig[i + 1][1].start() if i + 1 < len(trig) else len(clause)
                seg = clause[m.end():seg_end]
                out.mentioned = True
                before = clause[max(0, m.start() - 24):m.start()]
                if kind == "allergy" and _REMOVE.search(before):
                    terms, _ = _terms(seg, [])
                    out.removed += [t for t in terms if t not in out.removed]
                    mode = None
                    continue
                if _NEG.search(before) and kind == "allergy":
                    out.negated = True
                    mode = None  # "không (hề) bị dị ứng …": states absence; nothing to record
                    continue
                if kind == "avoid":
                    local = []
                    terms, lexicon = _terms(_cut_tail(seg), local)
                    out.avoid += [t for t in terms if allergens.recognised(t) and t not in out.avoid]
                    out.avoid_any += [t for t in terms if t not in out.avoid_any and not _STOP.search(t)]
                    mode = "avoid" if terms else None
                    continue
                terms, lexicon = _terms(seg, out.issues)
                bucket = out.allergies
                bucket += [t for t in terms if t not in bucket]
                mode = kind if terms else None
            continue
        if mode:
            found = _continuation(clause)
            if found:
                bucket = out.allergies if mode == "allergy" else out.avoid
                bucket += [t for t in found if t not in bucket]
                continue
        mode = None
    return out
