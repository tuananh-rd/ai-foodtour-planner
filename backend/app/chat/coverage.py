"""U1: deterministic coverage audit for one user message (contract v1.9).

`extras()` pulls the slots the older parsers never handled (number of stops, day part, liked dishes).
`audit()` lists every signal the text carries and whether the rules captured it; an `uncovered` signal is what lets
the engine consult the LLM (a confident intent alone is not enough) and what the UI must never swallow silently.
Pure functions: no I/O, no state mutation, no network.
"""
from __future__ import annotations

import re
from typing import Iterable

from app.planner.relevance import fold_uncached

NUMWORDS = {"mot": 1, "hai": 2, "ba": 3, "bon": 4, "tu": 4, "nam": 5}
DAY_PARTS = {"morning": "Buổi sáng", "noon": "Buổi trưa", "afternoon": "Buổi chiều", "evening": "Buổi tối", "late": "Khuya"}
MEAL_OF = {"evening": "dinner", "late": "late", "noon": "lunch", "morning": "breakfast", "afternoon": "snack"}

_TOUR_CTX = re.compile(r"\b(?:tour|lich trinh|hanh trinh|ghe|an|di|choi|chang)\b")
_STOPS = re.compile(r"(?<!giua )(?<!hon )(?<!moi )\b(\d{1,2}|mot|hai|ba|bon|nam)\s*(?:quan|diem dung|diem|dia diem|chang)\b")
_LIKE = re.compile(r"(?:\bthích\b|\bmuốn ăn\b|\bưa\b|\bmê\b|\bthèm\b|\bthich\b|\bmuon an\b)\s+(.+?)(?=[.,;!?\n]|\bnhưng\b|\bnhung\b|\bdị ứng\b|\bdi ung\b|\bkhông ăn\b|\bkhong an\b|\bhãy\b|\bhay\b|\bvà nhớ\b|$)",
                   re.IGNORECASE)
_NEGATED = re.compile(r"(?:không|khong|ko|chẳng|chang|chả|chưa|chua|đừng|dung)\s*(?:\w+\s+)?$", re.IGNORECASE)
_SPLIT = re.compile(r"\s*(?:,|;|\bvà\b|\bva\b|\bvới\b|\bvoi\b|\bhoặc\b|\bhoac\b|\bhay là\b|/)\s*")
_PARTICLES = {"nhé", "nhe", "nha", "đó", "do", "ạ", "a", "đi", "di", "thôi", "thoi", "nhỉ", "nhi", "nhen", "với", "voi", "luôn", "luon",
              "nè", "ne", "đấy", "day", "cơ", "co", "ha", "hen"}
_ITEM_STOP = {"ăn", "an", "các", "cac", "món", "mon", "đồ", "do", "những", "nhung", "mấy", "may", "loại", "loai", "một", "mot", "ít", "it",
              "nhiều", "nhieu", "là", "la", "thế", "the", "cái", "cai", "kiểu", "kieu"}
_NOT_FOOD_START = {"đi", "di", "ngồi", "ngoi", "xem", "chơi", "choi", "ở", "o", "nghỉ", "nghi", "tìm", "tim", "được", "duoc", "nơi", "noi"}


def _day_part(text: str, f: str):
    low = text.casefold()
    if re.search(r"\b\d{1,2}\s*(?:h|giờ|gio)\s*(?:\d{2}\s*)?tối\b|\b\d{1,2}\s*(?:h|giờ|gio)\s*(?:\d{2}\s*)?toi\b|\bgiờ tối\b", low):
        return "evening"
    if re.search(r"\b\d{1,2}\s*(?:h|giờ|gio)\s*(?:\d{2}\s*)?(?:chiều|chieu)\b", low):
        return "afternoon"
    if re.search(r"\b\d{1,2}\s*(?:h|giờ|gio)\s*(?:\d{2}\s*)?(?:sáng|sang)\b", low):
        return "morning"
    if re.search(r"\btối nay\b|\bbuổi tối\b|\btối mai\b|\btối (?:thứ|chủ|cuối)|\bđêm nay\b|\btoi nay\b|\bbuoi toi\b|\btoi mai\b", low):
        return "evening"
    if re.search(r"\bkhuya\b|\bđêm khuya\b|\bdem khuya\b", low):
        return "late"
    if re.search(r"\bbuổi chiều\b|\bchiều (?:nay|mai|thứ|chủ)|\bbuoi chieu\b|\bchieu (?:nay|mai)", low):
        return "afternoon"
    if re.search(r"\bbuổi trưa\b|\btrưa (?:nay|mai|thứ|chủ)|\bbuoi trua\b|\btrua (?:nay|mai)", low):
        return "noon"
    if re.search(r"\bbuổi sáng\b|\bsáng (?:nay|mai|thứ|chủ)|\bbuoi sang\b|\bsang (?:nay|mai)", low):
        return "morning"
    return None


def _items(raw: str) -> list:
    out = []
    for part in _SPLIT.split(raw.strip()):
        words = [w for w in part.split() if w.casefold().strip("\"'") not in _ITEM_STOP]
        while words and words[-1].casefold().strip("\"'.!") in _PARTICLES:
            words.pop()  # "phở nhé" -> "phở"
        if not words or len(words) > 3 or words[0].casefold() in _NOT_FOOD_START or any(c.isdigit() for c in part):
            continue
        item = " ".join(words).strip(" .\"'")
        if 1 < len(item) <= 30 and item.casefold() not in {o.casefold() for o in out}:
            out.append(item)
    return out[:4]


def extras(text: str, f: str) -> dict:
    """{stops?: int 1..5, day_part?, interests?: [str], _stops_rejected?: int} — only what the text states."""
    out = {}
    if _TOUR_CTX.search(f):
        m = _STOPS.search(f)
        if m:
            n = int(m.group(1)) if m.group(1).isdigit() else NUMWORDS[m.group(1)]
            if 1 <= n <= 5:
                out["stops"] = n
            else:
                out["_stops_rejected"] = n
    dp = _day_part(text, f)
    if dp:
        out["day_part"] = dp
    items = []
    for m in _LIKE.finditer(text):
        if _NEGATED.search(text[:m.start()]):
            continue  # "không thích bún" is an aversion, never an interest
        if re.match(r"\s*(?:tour|lịch trình|hành trình|\d)", m.group(1), re.IGNORECASE):
            continue  # "muốn ăn tour 3 quán …" states a goal, not a dish
        items += [i for i in _items(m.group(1)) if i.casefold() not in {x.casefold() for x in items}]
    if items:
        out["interests"] = items[:6]
    return out


_CUES = {
    "allergy": re.compile(r"\bdi ung\b|\bkieng\b|\bkhong (?:the )?an (?:duoc)?\b.{0,3}|\bbi di ung\b"),
    "budget": re.compile(r"\bngan sach\b|\bchi toi da\b|\d[\d.,]*\s*(?:k|nghin|ngan|trieu|tr|d|dong)\b|\bnua trieu\b"),
    "duration": re.compile(r"\b\d{1,3}\s*(?:phut|tieng|gio)\b"),
    "party": re.compile(r"\b(?:\d{1,2}|hai|ba|bon|nam|sau|bay|tam)\s*nguoi\b"),
    "stops": _STOPS,
}


def audit(text: str, f: str, patch: dict, *, allergy_terms: Iterable[str] = (), allergy_negated: bool = False,
          has_budget: bool = False, has_party: bool = False) -> list:
    """[{kind, status: captured|uncovered}] for every signal cue found in `text` (patch = merged rule extraction)."""
    sig = []

    def add(kind, ok):
        sig.append({"kind": kind, "status": "captured" if ok else "uncovered"})
    if _CUES["allergy"].search(f):
        add("allergy", bool(list(allergy_terms)) or allergy_negated)
    if _CUES["budget"].search(f):
        add("budget", "budget_vnd" in patch or has_budget)
    if _CUES["party"].search(f):
        add("party", "party_size" in patch or has_party)
    if _CUES["duration"].search(f) and re.search(r"\bphut\b|\btieng\b|\bgio\b", f):
        add("duration", any(k in patch for k in ("duration_min", "max_leg_min", "start_time", "end_time")))
    if _TOUR_CTX.search(f) and _STOPS.search(f):
        add("stops", "stops" in patch or "_stops_rejected" in patch)
    if _day_part(text, f):
        add("day_part", "day_part" in patch)
    if any(not _NEGATED.search(text[:m.start()]) and not re.match(r"\s*(?:tour|lịch trình|hành trình|\d)", m.group(1), re.IGNORECASE) for m in _LIKE.finditer(text)):
        add("dish", "interests" in patch)
    return sig


def trigger(signals: list) -> str | None:
    """Why the LLM should look at this message even though the rules are confident (None = rules suffice)."""
    unc = [s for s in signals if s["status"] == "uncovered"]
    if unc:
        return "uncovered"
    return None


def multi_clause(signals: list) -> bool:
    n = len(signals)
    return n >= 3 and sum(s["status"] == "captured" for s in signals) / n < 0.5
