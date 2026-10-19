"""Clause-based parser for allergy / avoidance statements (C0-HF round 3).

Design: normalise (NFC, no format chars), split into clauses, handle each clause's own trigger and local negation,
let bare allergen words continue a list ("dị ứng cua, tôm và sữa"), and NEVER drop a statement silently: anything that
cannot be turned into a concrete term becomes an *issue* the caller must answer with a clarification.
"""
from __future__ import annotations

import contextvars
import re
import unicodedata
from dataclasses import dataclass, field

from app.planner import allergens
from app.planner.relevance import fold_uncached

_CLAUSE_SPLIT = re.compile(r"[,;.!?\n]+|\s+(?:và|va|nhưng|nhung|mà|ma|còn|con|hoặc|hoac)\s+")
_ALLERGY = re.compile(r"(?:d[iị]\s*[uưúùủũụứừửữự]ng|di ung)")
_AVOID = re.compile(r"(?:không|khong|ko)\s+(?:thể\s+|the\s+)?(?:ăn|an)(?:\s+(?:được|duoc))?|kiêng|kieng|tránh|tranh|"
                    r"đừng\s+(?:cho|ăn|lấy)|dung\s+(?:cho|an|lay)|ghét|ghet|\bavoid\b|né|không chọn món(?: có)?|khong chon mon(?: co)?|không lấy món(?: có)?")
_NEG = re.compile(r"(?:không hề|khong he|không bao giờ|khong bao gio|chưa từng|chua tung|chưa bao giờ|"
                  r"không|khong|chẳng|chang|chưa|chua|ko|hết|het)\s*(?:còn|con|bị|bi|có|co)?\s*$")
_NEG_PREFIX = re.compile(r"(?:không có chuyện|khong co chuyen|làm gì có|lam gi co|đâu có|dau co|chẳng có chuyện|chang co chuyen)\s*(?:mình|minh|tôi|toi|em|tui|tớ|to)?\s*$", re.IGNORECASE)
_SYMPTOM = re.compile(r"(?:mẩn ngứa|man ngua|nổi mẩn|noi man|mề đay|me day|sưng môi|sung moi|sưng mặt|khó thở|kho tho|phát ban|phat ban|ngứa họng|ngua hong|ngứa cổ|nổi ban|sốc phản vệ)", re.IGNORECASE)
_UNSURE = re.compile(r"(?:chưa biết|chua biet|chưa chắc|chua chac|không chắc|khong chac|chưa rõ|chua ro|không biết có phải|khong biet co phai|có phải .* không|co phai .* khong)", re.IGNORECASE)
_UNNAMED = re.compile(r"\b(?:nguyên liệu|nguyen lieu|chất|chat|thứ|thu|món|mon|loại|loai)\b[^.,;]{0,25}\b(?:chưa rõ|chua ro|không rõ|khong ro|nào đó|nao do|gì đó|gi do|khác|khac|kia)\b", re.IGNORECASE)
_NORMAL_EAT = re.compile(r"(?:ăn|an)\s+(?:được\s+|duoc\s+)?(?:bình thường|binh thuong|thoải mái|thoai mai|tốt|tot)", re.IGNORECASE)
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
_AMBIGUOUS_RAW = {"của", "cùa", "cúa", "số", "sổ", "sỗ", "cả", "cã"}  # "của" (of) folds to "cua" (crab)
MAX_SCAN_WORDS = 8
_ASCII_MSG = contextvars.ContextVar("ascii_msg", default=False)  # the whole message has no diacritics: ambiguous plain-ASCII allergen words are then allowed


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
    negated_terms: list = field(default_factory=list)  # "không bị dị ứng tôm": a named absence (removes only that term)
    avoid_hard: list = field(default_factory=list)     # avoid terms said with a hard cue (không ăn được / kiêng): treated as allergies when guided
    avoid_vague: bool = False                      # "không ăn được vài thứ": an avoidance cue with only a description, no named food


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
            if size == 1 and chunk[0].isascii() and fold_uncached(chunk[0]) in _AMBIGUOUS_UNACCENTED and not _ASCII_MSG.get():
                break  # "hen" (a Southern sentence particle) vs "hến" (clam): accented spelling required in an accented message
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
    words = _clean_words(rest)
    for i, w in enumerate(words):
        if fold_uncached(w) in _TAIL_STOP or w in _TAIL_STOP:
            if fold_uncached(w) == "voi" and _scan(words[i + 1:i + 4])[0]:
                out.append(w)  # "mè với đậu phộng": 'với' joins two allergens here
                continue
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
    if len(core) > 1 and fold_uncached(core[0]) == "co" and not allergens.family_of(cand):
        issues.append("vague")  # "có vỏ cứng": a description of a kind of food, not a named one
        return [], False
    if not (allergens.family_of(cand) and allergens.core_term(cand) == cand) and any(fold_uncached(w) in _VAGUE for w in core):
        issues.append("vague")  # a description ("thứ rang giòn"), not a named food: ask which one
        return [], False
    if _STOP.search(cand):
        issues.append("empty")
        return [], False
    if len(core) > 3 or len(cand) > allergens.MAX_TERM_CHARS:
        issues.append("long")
        return [], False
    return [cand], False


_HARD_CUE = re.compile(r"(?:khong|ko)\s+(?:the\s+)?an\s+duoc|khong the an|kieng")
_VAGUE = {"thu", "nao", "may", "vai", "nhieu", "kieu", "dang", "gion", "rang", "chien", "xao", "nuong", "gi", "loai", "vo", "cung", "mem", "tuoi", "song", "chin",
          "thuc", "pham", "chat", "nguyen", "lieu", "chan", "doan", "ro", "biet", "thu", "pham", "chua"}
_AMBIGUOUS_UNACCENTED = {"ca", "so", "oc", "hen", "hau", "muc"}  # "cả nhóm", "số", "ốc"... when typed without accents


def _before_terms(text: str, cache=None) -> list:
    """Lexicon allergens that PRECEDE a cue in the same clause: "Lạc thì mình không ăn được", "Tôm làm mình dị ứng"."""
    words = _clean_words(text)[-8:]
    # Repeated trigger prefixes often have identical final words. Cache only
    # inside this parse invocation; private text never survives the user turn.
    key = (tuple(words), 'mè' in text.casefold())
    if cache is not None and key in cache:
        return list(cache[key])
    found, _ = _scan(words)
    result = [t for t in found if not (fold_uncached(t) == "me" and not key[1])]
    if cache is not None and len(cache) < 256:
        cache[key] = tuple(result)
    return result


def _triggers(clause: str) -> list:
    """All (kind, match) triggers in a clause, in order, without overlaps."""
    found = ([("allergy", m) for m in _ALLERGY.finditer(clause)] + [("symptom", m) for m in _SYMPTOM.finditer(clause)]
             + [("avoid", m) for m in _AVOID.finditer(clause)])
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
    before_cache = {}
    text = normalize(text)
    _ASCII_MSG.set(text.isascii())
    if _QUOTE.search(text) and _EXAMPLE.search(text) and _ALLERGY.search(text):
        out.mentioned = True
        out.issues.append("example")
        return out
    mode = None  # "allergy" | "avoid" | None  (list continuation)
    hard_mode = False
    bare = []  # allergen words that formed a clause of their own ("Tôm và một chất chưa rõ làm mình dị ứng")
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
                before_full = clause[:m.start()]
                before = clause[max(0, m.start() - 24):m.start()]
                if kind in ("allergy", "symptom") and _REMOVE.search(before):
                    terms, _ = _terms(seg, [])
                    out.removed += [t for t in terms if t not in out.removed]
                    mode = None
                    continue
                if kind == "allergy" and (_NEG.search(before) or _NEG_PREFIX.search(before)):
                    out.negated = True
                    named, _lex = _terms(seg, [])  # a named absence only retracts that term; "gì cả/nào" retracts nothing specific
                    named = [t for t in named if allergens.recognised(t)] or _before_terms(before_full, before_cache)
                    out.negated_terms += [t for t in named if t not in out.negated_terms]
                    mode = None  # "không (hề) bị dị ứng …": states absence; nothing to record
                    continue
                if kind in ("allergy", "symptom") and _UNSURE.search(clause) and not _UNNAMED.search(clause):
                    out.issues.append("empty")  # "chưa biết có phải dị ứng không": a doubt, not a statement; keep the question open
                    mode = None
                    continue
                if kind == "avoid":
                    local = []
                    terms, lexicon = _terms(_cut_tail(seg), local)
                    if not terms and "vague" in local:
                        out.avoid_vague = True
                    hard = bool(_HARD_CUE.search(fold_uncached(m.group(0))))
                    if hard:
                        terms = [t for t in terms if allergens.recognised(t)] or _before_terms(before_full, before_cache)  # "Lạc thì mình không ăn được đâu"
                    out.avoid += [t for t in terms if allergens.recognised(t) and t not in out.avoid]
                    if hard:
                        out.avoid_hard += [t for t in terms if allergens.recognised(t) and t not in out.avoid_hard]
                    out.avoid_any += [t for t in terms if t not in out.avoid_any and not _STOP.search(t)]
                    mode, hard_mode = ("avoid" if terms else None), hard
                    continue
                local = []
                if kind == "symptom":
                    found, _ = _scan(_clean_words(seg))
                    terms = list(dict.fromkeys(_before_terms(before_full, before_cache) + found))
                    if not terms:
                        local.append("empty")
                else:
                    terms, lexicon = _terms(seg, local)
                    if not terms and not local:
                        local.append("empty")
                    if not terms:
                        bt = _before_terms(before_full, before_cache) or ([t for t in bare if True] if "empty" in local else [])
                        if bt:
                            terms, local = bt, []
                if _UNNAMED.search(clause):
                    local.append("empty")  # "…và một nguyên liệu chưa rõ tên": another substance exists but is unnamed
                out.issues += local
                bucket = out.allergies
                bucket += [t for t in terms if t not in bucket]
                mode, hard_mode = (kind if terms else None), False
                if mode == "symptom":
                    mode = "allergy"
            bare = []
            continue
        if _NORMAL_EAT.search(clause):
            named = _before_terms(clause)
            if named:
                out.negated = True
                out.negated_terms += [t for t in named if t not in out.negated_terms]  # "tôm mình ăn bình thường": not an allergy
            mode = None
            continue
        if mode:
            found = _continuation(clause)
            if found:
                bucket = out.allergies if mode == "allergy" else out.avoid
                bucket += [t for t in found if t not in bucket]
                if mode == "avoid" and hard_mode:
                    out.avoid_hard += [t for t in found if t not in out.avoid_hard]
                continue
            if mode == "allergy" and (_UNNAMED.search(clause) or re.search(r"\b(?:chat|thu|mon|loai|thuc pham|cai)\s+(?:khac|nua)\b", fold_uncached(clause))):
                out.issues.append("empty")  # "…tôm và một chất khác": another allergy was mentioned but not named
                continue
        words = _clean_words(clause)
        f_, all_used = _scan(words)
        bare = f_ if f_ and all_used else []
        mode = None
    return out
