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


def numeric_prefix_spacing(text: str) -> str:
    """Separate known request prefixes from attached digits, without rewriting IDs/addresses."""
    text = re.sub(r'\b(tour)(?=\d)', r'\1 ', text, flags=re.IGNORECASE)
    text = re.sub(r'\b((?:tối|toi|sáng|sang|chiều|chieu|trưa|trua)\s+(?:nay|mai))(?=\d)',
                  r'\1 ', text, flags=re.IGNORECASE)
    # Lowercase request words only: capitalised venue/address labels such as
    # "Mai2", "Tam3" and "Trong5" must remain intact for lookup.
    return re.sub(r'\b(trong|cho|khoảng|khoang|tầm|tam)(?=\d)', r'\1 ', text)

_TOUR_CTX = re.compile(r"\b(?:tour|lich trinh|hanh trinh|ghe|an|di|choi|chang|phut|tieng|ngan sach|nguoi|chuyen|vong|toi nay|sang mai|sang nay|chieu|trua|toi mai)\b")
_STOPS = re.compile(r"(?<!giua )(?<!hon )(?<!moi )\b(\d{1,2}|mot|hai|ba|bon|nam)\s*(?:quan|hang an|hang|diem dung|diem|dia diem|chang)\b(?!\s*(?:cach nhau|ke nhau|gan nhau|lien tiep))"
                    r"|\bso (?:quan|diem)\s*(?:la|:)?\s*(\d{1,2})\b")
_LIKE = re.compile(r"(?:\byêu thích\b|\bưa chuộng\b|\bđam mê\b|\bthích\b|\bmuốn ăn\b|\bưa\b|\bmê\b|\bthèm\b|\bkhoái\b|\bghiền\b|\bnghiện\b|\byeu thich\b|\bthich\b|\bmuon an\b|\bkhoai\b)"
                   r"\s*[:\-–]?\s*(?:là\s+|la\s+)?(.+?)(?=[.,;!?\n]|\bnhưng\b|\bnhung\b|\bdị ứng\b|\bdi ung\b|\bkhông ăn\b|\bkhong an\b|\bhãy\b|\bhay\b|\bvà nhớ\b|\bchưa\b|\bchua\b|$)",
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
    # bare words ("Sáng. 4 người…", "Lịch chiều…", "trưa 3 điểm"): accents required, common compounds excluded
    if re.search(r"\bđêm\b(?!\s*(?:nay))|\btối muộn\b", low):
        return "late"
    if re.search(r"\bchiều tối\b|\btối\b(?!\s*(?:đa|thiểu|ưu|tân|giản|nay|mai))", low):
        return "evening"
    if re.search(r"\bxế chiều\b|\bchiều\b(?!\s*(?:dài|cao|rộng|sâu|ngang|lòng|chuộng|nay|mai))", low):
        return "afternoon"
    if re.search(r"\btrưa\b", low):
        return "noon"
    if re.search(r"\bsáng sớm\b|\bsáng\b(?!\s*(?:tạo|suốt|giá|dạ|kiến|lạng|nay|mai))", low):
        return "morning"
    return None


_CUT_WORDS = {"ở", "trong", "cho", "vào", "lúc", "tại", "quanh", "gần", "khu", "tối", "sáng", "chiều", "trưa", "nay", "mai", "khoảng", "tầm", "qua", "để",
              "o", "vao", "luc", "tai", "gan", "toi", "sang", "chieu", "trua", "khoang", "tam", "qua", "de", "nhung", "mà", "ma", "thôi", "thoi"}
_DISHES = [("bún đậu mắm tôm", "bun dau mam tom"), ("bún riêu", "bun rieu"), ("bún bò", "bun bo"), ("bún thang", "bun thang"), ("bún ốc", "bun oc"),
           ("bún ngan", "bun ngan"), ("bún cá", "bun ca"), ("bún chả", "bun cha"), ("bún", "bun"), ("phở cuốn", "pho cuon"), ("phở", "pho"),
           ("bánh đa cua", "banh da cua"), ("bánh cuốn", "banh cuon"), ("bánh mì", "banh mi"), ("bánh xèo", "banh xeo"), ("bánh giò", "banh gio"),
           ("bánh tôm", "banh tom"), ("bánh bao", "banh bao"), ("bánh gối", "banh goi"), ("bánh trôi", "banh troi"), ("mì vằn thắn", "mi van than"),
           ("miến", "mien"), ("cháo", "chao"), ("xôi xéo", "xoi xeo"), ("xôi", "xoi"), ("nem rán", "nem ran"), ("nem", "nem"), ("chả giò", "cha gio"),
           ("chả cá", "cha ca"), ("cơm tấm", "com tam"), ("cơm rang", "com rang"), ("cơm", "com"), ("hủ tiếu", "hu tieu"), ("bò kho", "bo kho"),
           ("gà rán", "ga ran"), ("cá kho", "ca kho"), ("lẩu", "lau"), ("ốc", "oc"), ("chè thái", "che thai"), ("chè", "che"), ("kem", "kem"),
           ("trà sữa", "tra sua"), ("sinh tố", "sinh to"), ("cà phê", "ca phe")]
_NEG_BEFORE = {"không", "khong", "ko", "chẳng", "chang", "ghét", "ghet", "chán", "chan", "né", "kiêng", "kieng", "bỏ", "bo", "đừng", "dung", "dị", "ứng", "ung"}


def _dish_scan(text: str) -> list:
    """Known dish names mentioned anywhere (so "Phở trước nha", "bánh mì là món thích" still count). Accents required when the message has any."""
    low = text.casefold()
    accented = any(ord(c) > 127 for c in low)
    taken, hits = [], []
    for disp, plain in sorted(_DISHES, key=lambda d: -len(d[0])):
        word = disp if accented else plain
        for m in re.finditer(r"(?<![\w])" + re.escape(word) + r"(?![\w])", low):
            if any(m.start() < e and s0 < m.end() for s0, e in taken):
                continue  # already part of a longer dish ("bún" inside "bún riêu")
            prefix = low[:m.start()].split()[-3:]
            taken.append((m.start(), m.end()))
            if any(t.strip(",.;:!?\"'") in _NEG_BEFORE for t in prefix):
                continue
            hits.append((m.start(), word))
    out = []
    for _pos, word in sorted(hits):
        if word not in out:
            out.append(word)
    return out


def _trim_item(item: str) -> str:
    words = item.split()
    for i, w in enumerate(words):
        if i > 0 and w.casefold().strip(",.") in _CUT_WORDS:
            return " ".join(words[:i])
    return item


def _items(raw: str) -> list:
    out = []
    for part in _SPLIT.split(raw.strip()):
        words = [w for w in part.split() if w.casefold().strip("\"'") not in _ITEM_STOP]
        while words and words[-1].casefold().strip("\"'.!") in _PARTICLES:
            words.pop()  # "phở nhé" -> "phở"
        if not words or len(words) > 3 or words[0].casefold() in _NOT_FOOD_START or any(c.isdigit() for c in part):
            continue
        item = _trim_item(" ".join(words).strip(" .\"'"))
        if 1 < len(item) <= 30 and item.casefold() not in {o.casefold() for o in out}:
            out.append(item)
    return out[:4]


def extras(text: str, f: str) -> dict:
    """{stops?: int 1..5, day_part?, interests?: [str], _stops_rejected?: int} — only what the text states."""
    text, f = numeric_prefix_spacing(text), numeric_prefix_spacing(f)
    out = {}
    if _TOUR_CTX.search(f):
        m = _STOPS.search(f)
        if m:
            g = m.group(1) or m.group(2)
            n = int(g) if g.isdigit() else NUMWORDS[g]
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
    for d in _dish_scan(text):
        if d.casefold() not in {x.casefold() for x in items} and not any(d.casefold() in x.casefold() for x in items):
            items.append(d)
    if items:
        out["interests"] = items[:6]
    return out


_CUES = {
    "allergy": re.compile(r"\bdi ung\b|\bkieng\b|\bkhong (?:the )?an (?:duoc)?\b.{0,3}|\bbi di ung\b"),
    "budget": re.compile(r"\bngan sach\b|\btui tien\b|\bchi toi da\b|\d[\d.,]*\s*(?:k|nghin|ngan|trieu|tr|d|dong)\b|\b(?:nua|mot|hai|ba|bon|nam|tram|muoi)\s+(?:trieu|nghin|ngan)\b"),
    "duration": re.compile(r"\b(?:\d{1,3}|mot|hai|ba|bon|nam|sau|nua)\s*(?:phut|tieng|gio)\b"),
    "party": re.compile(r"\b(?:\d{1,2}|hai|ba|bon|nam|sau|bay|tam)\s*(?:nguoi|dua|thanh vien)\b"),
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
        add("budget", "budget_vnd" in patch or "budget_scope" in patch)
    if _CUES["party"].search(f):
        add("party", "party_size" in patch)
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
