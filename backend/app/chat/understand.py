"""Rules-first understanding of one user turn (Vietnamese, with or without diacritics).

`understand(text, state, gazetteer)` returns an `Understanding` with a confidence. The engine only asks an LLM when
the confidence is low; this module never calls one. Corpus: qa/chat/utterances.jsonl (qa/chat/eval_utterances.py).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from app.llm import safety_parse
from app.llm.extract import MockExtractor, INJECTION
from app.planner import allergens
from app.planner.relevance import fold_uncached
from app.planner.types import Preferences
from . import coverage, knowledge, tools
from .state import ChatState

INTENTS = ("GREET_OR_SMALLTALK", "DISCOVER_DISH", "SEARCH_VENUES", "COMPARE", "ADD", "REMOVE", "KEEP", "UPDATE_PROFILE",
           "SET_ALLERGY", "SET_AVOID", "ANSWER_PENDING", "CONFIRM_YES", "CONFIRM_NO", "AMBIGUOUS_ACK", "REQUEST_PLAN",
           "MODIFY_PLAN", "ASK_DETAIL", "OUT_OF_SCOPE", "UNSAFE", "UNKNOWN")
CONFIDENT = 0.75
ACK_START = {"ok", "oke", "okie", "okay", "oki", "okk", "u", "um", "uhm", "uh", "ua", "uk", "o", "vang", "da", "roi", "duoc", "ro", "yes", "yeah",
             "got", "noted", "sure", "alright", "nghe", "hieu"}


@dataclass
class Understanding:
    intent: str
    patch: dict = field(default_factory=dict)
    refs: list = field(default_factory=list)
    confidence: float = 0.9
    source: str = "rules"
    extra: dict = field(default_factory=dict)


def _w(f: str, *words) -> bool:
    return any(re.search(r"(?<![a-z0-9])" + re.escape(x) + r"(?![a-z0-9])", f) for x in words)


# --------------------------------------------------------------------------------------- references
ORD = {"nhat": 1, "mot": 1, "1": 1, "hai": 2, "2": 2, "ba": 3, "3": 3, "bon": 4, "tu": 4, "4": 4, "nam": 5, "5": 5}


def parse_refs(text: str, folded: str) -> list:
    refs = []
    for m in re.finditer(r"(?<![A-Za-zÀ-ỹ])([A-E])(?![A-Za-zÀ-ỹ])", text):
        if m.group(1) not in refs:
            refs.append(m.group(1))
    def num(w: str) -> str:
        return str(ORD[w]) if w in ORD else str(int(w))

    for m in re.finditer(r"(?:quan|cai|diem(?:\s+dung)?|cho)\s+thu\s+(nhat|hai|ba|bon|tu|nam|\d{1,2})\b", folded):
        refs.append(num(m.group(1)))
    for m in re.finditer(r"(?:^|\s)(?:thu)\s+(nhat|hai|ba|bon|nam|\d{1,2})\b", folded):
        if len(folded.split()) <= 6 and num(m.group(1)) not in refs:
            refs.append(num(m.group(1)))
    if re.search(r"(?:quan|cai|diem)\s+(?:dau tien|dau)\b|\bcai (?:dau|nhat)\b|\bdau tien\b", folded):
        refs.append("1")
    if re.search(r"(?:quan|cai|diem)\s+(?:cuoi cung|cuoi|sau)\b|\bcuoi cung\b", folded):
        refs.append("last")
    if re.search(r"\b(?:tat ca|het danh sach|toan bo|bo het)\b", folded):
        refs.append("all")
    return list(dict.fromkeys(refs))


# --------------------------------------------------------------------------------------- slots
def _hour(h: str, part: Optional[str]) -> int:
    n = int(h)
    if part in ("chieu", "toi") and n < 12:
        n += 12
    return n


def parse_times(f: str) -> dict:
    out = {}
    hm = re.findall(r"\b([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)\b", f)
    if hm:
        h, m = int(hm[0][0]), int(hm[0][1])
        key = "end_time" if re.search(r"ket thuc|xong|ve truoc|truoc luc", f) else "start_time"
        out[key] = f"{h:02d}:{m:02d}"
        if len(hm) > 1 and key == "start_time":
            out["end_time"] = f"{int(hm[1][0]):02d}:{int(hm[1][1]):02d}"
        return out
    part = "chieu" if re.search(r"\bchieu\b", f) else ("toi" if re.search(r"\btoi\b", f) else None)
    rng = re.search(r"(?:tu|luc|bat dau|di)?\s*(\d{1,2})\s*(?:gio|h)\s*(\d{2})?\s*(?:den|toi|-)\s*(\d{1,2})\s*(?:gio|h)\s*(\d{2})?", f)
    if rng:
        a, b = _hour(rng.group(1), part), _hour(rng.group(3), part)
        if a < 24 and b < 24 and a != b:
            out["start_time"] = f"{a:02d}:{int(rng.group(2) or 0):02d}"
            out["end_time"] = f"{b:02d}:{int(rng.group(4) or 0):02d}"
            return out
    s = re.search(r"(?:luc|bat dau|xuat phat|di luc|tu)\s*(\d{1,2})\s*(?:gio|h)\s*(\d{2})?", f)
    if s and _hour(s.group(1), part) < 24:
        out["start_time"] = f"{_hour(s.group(1), part):02d}:{int(s.group(2) or 0):02d}"
    e = re.search(r"(?:ket thuc|xong|ve)\s*(?:truoc|luc)?\s*(\d{1,2})\s*(?:gio|h)\s*(\d{2})?", f)
    if e and _hour(e.group(1), part) < 24:
        out["end_time"] = f"{_hour(e.group(1), part):02d}:{int(e.group(2) or 0):02d}"
    if not out:  # "5h chiều" style
        g = re.search(r"(\d{1,2})\s*h\s*(chieu|toi|sang)", f)
        if g:
            out["start_time"] = f"{_hour(g.group(1), g.group(2)):02d}:00"
    return out


def parse_vehicle(f: str, text: str = "") -> Optional[str]:
    if re.search(r"\bdi bo\b|\bbo bo\b|\bdi chan\b", f):
        return "walk"
    if re.search(r"xe may|\bxe om\b", f):
        return "motorbike"
    if re.search(r"\bo to\b|\boto\b|xe hoi|\bxe 4 cho\b", f):
        return "car"
    if re.search(r"\bgrab\b|\btaxi\b|\bxanh sm\b", f) or re.search(r"(?<![a-zà-ỹ])be(?![a-zà-ỹ])", text.casefold()):
        return "taxi"  # "be" (the app) only when typed without accent; "bé" (child) never
    return None


def parse_slots(text: str, f: str, prior: Preferences) -> dict:
    """Profile patch from explicit statements."""
    patch = {}
    patch.update(parse_times(f))
    clock = re.search(r"(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])", text)  # "18:45" loses its colon when folded
    if clock and "start_time" not in patch and "end_time" not in patch:
        key = "end_time" if re.search(r"ket thuc|xong|truoc luc|ve truoc", f) else "start_time"
        patch[key] = f"{int(clock.group(1)):02d}:{clock.group(2)}"
    veh = parse_vehicle(f, text)
    if veh:
        patch["vehicle"] = veh
    m = re.search(r"khong\s+(?:muon\s+)?(?:di bo\s+)?(?:qua|hon)\s+(\d{1,2})\s*phut", f)
    if m and 3 <= int(m.group(1)) <= 60:
        patch["max_leg_min"] = int(m.group(1))
    # numbers (party size, budget, duration) via the existing rule extractor, with the time phrases removed first
    stripped = re.sub(r"(?:tu|luc|bat dau|xuat phat|di luc|ket thuc|xong|ve)?\s*(?:truoc\s*)?\d{1,2}\s*(?:gio|h)\s*\d{0,2}"
                      r"(?:\s*(?:den|toi|-)\s*\d{1,2}\s*(?:gio|h)\s*\d{0,2})?", " ", f)
    # a per-leg time ("không đi bộ quá 10 phút mỗi chặng") is not the tour length: remove it before the duration is read
    stripped = re.sub(r"khong\s+(?:muon\s+)?(?:di bo\s+)?(?:qua|hon)\s+\d{1,2}\s*phut(?:\s+(?:moi|1)\s+(?:chang|quan))?", " ", stripped)
    leg = (re.search(r"(?:moi chang|giua (?:cac|hai|2) quan|giua cac diem)[^.;]{0,14}?(?<!\d)(\d{1,2})\s*phut", f)
           or re.search(r"(?<!\d)(\d{1,2})\s*phut\s*(?:moi chang|giua (?:cac|hai|2) quan)", f))
    if leg and 3 <= int(leg.group(1)) <= 60:
        if "max_leg_min" not in patch:
            patch["max_leg_min"] = int(leg.group(1))
        span = leg.group(0)
        stripped = stripped.replace(span, " ", 1)
    dur_words = {"một": 1, "mot": 1, "hai": 2, "ba": 3, "bốn": 4, "bon": 4, "năm": 5, "nam": 5, "sáu": 6, "sau": 6}
    mdur = re.search(r"(?<![\d.,])(\d{1,2}|" + "|".join(k for k in dur_words if k.isascii()) + r")\s*(?:tieng|gio dong ho|h dong ho)(?:\s*(ruoi))?", stripped)
    if mdur and "duration_min" not in patch:
        n = int(mdur.group(1)) if mdur.group(1).isdigit() else dur_words[mdur.group(1)]
        mins = n * 60 + (30 if mdur.group(2) else 0)
        if 30 <= mins <= 720:
            patch["duration_min"] = mins
            stripped = stripped.replace(mdur.group(0), " ", 1)
    mp = re.search(r"(?<![\d.,])(\d{2,3})\s*p\b(?!\w)", stripped)
    if mp and "duration_min" not in patch and 30 <= int(mp.group(1)) <= 720:
        patch["duration_min"] = int(mp.group(1))  # "90p"
        stripped = stripped.replace(mp.group(0), " ", 1)
    money = None
    dm = re.search(r"(?<![\d.,])(\d+) (\d) (?:trieu|tr)\b", stripped)  # fold turns "1,5 triệu" into "1 5 trieu"
    if dm:
        money = (int(dm.group(1)) * 10 + int(dm.group(2))) * 100_000
        stripped = stripped.replace(dm.group(0), " ", 1)
    dm = re.search(r"(?<![\d.,])(\d+) (?:trieu|tr) (\d{3}) (?:nghin|ngan|k)\b", stripped)  # 1 triệu 500 nghìn
    if dm:
        money = int(dm.group(1)) * 1_000_000 + int(dm.group(2)) * 1000
        stripped = stripped.replace(dm.group(0), " ", 1)
    dm = re.search(r"\b(mot|hai|ba|bon|nam) trieu ruoi\b", stripped)  # một triệu rưỡi
    if dm:
        money = int(({"mot": 1, "hai": 2, "ba": 3, "bon": 4, "nam": 5}[dm.group(1)] + 0.5) * 1_000_000)
        stripped = stripped.replace(dm.group(0), " ", 1)
    rx = MockExtractor().extract(stripped if stripped.strip() else "", Preferences())
    p = rx.preferences
    if "party_size" in rx.updated_fields:
        patch["party_size"] = p.party_size
    if money is not None and "budget_vnd" not in rx.updated_fields and 0 < money <= 100_000_000:
        patch["budget_vnd"] = money
    if "budget_vnd" in rx.updated_fields:
        patch["budget_vnd"] = p.budget_vnd
        if p.budget_scope:
            patch["budget_scope"] = p.budget_scope
    elif "budget_scope" in rx.updated_fields:
        patch["budget_scope"] = p.budget_scope
    if "budget_vnd" in patch:
        grp = re.search(r"ca nhom|ca chuyen|theo nhom|ca doan|ca hoi|ca ban|tat ca|tong\s+(?:ngan sach|cong|so tien|chi|tien|nhom)|tong\s+\d+\s*(?:k\b|nghin|ngan|trieu|tr\b|dong)|quy chung|chi chung|chung\s+(?:tien|ngan sach)|nhom chi|tong cong", f)
        per = re.search(r"moi nguoi|moi dua|moi ban|mot nguoi|1 nguoi|dau nguoi|theo dau|per person|(?:\dk|\d+ k|nghin|ngan|trieu|tr|dong)\s+nguoi\b(?!\s*(?:la|ma|di|cung))", f)
        if (grp and per) or re.search(r"chua ro|khong biet|chua biet|khong chac", f):
            patch.pop("budget_scope", None)  # both readings (or an open question): leave it to the clarify
        elif grp:
            patch["budget_scope"] = "group"
        elif per:
            patch["budget_scope"] = "per_person"
        else:
            patch.pop("budget_scope", None)
    if "duration_min" in rx.updated_fields and "end_time" not in patch:
        patch["duration_min"] = p.duration_min
    elif "end_time" not in patch and "start_time" not in patch:
        d = re.search(r"(?:tong|trong khoang|trong|khoang|tour|lich trinh|hanh trinh|ke hoach|di choi|an uong|choi|di)\s*(?:\w+\s+){0,3}?(\d{2,3})\s*phut", stripped)
        if d and 30 <= int(d.group(1)) <= 720:
            patch["duration_min"] = int(d.group(1))
    if "party_size" not in patch:
        words = {"mot": 1, "hai": 2, "ba": 3, "bon": 4, "nam": 5, "sau": 6, "bay": 7, "tam": 8}
        money_per = re.search(r"(?:k|nghin|ngan|trieu|tr|dong)\s+(?:mot|1)\s+nguoi", f)
        if re.search(r"\b(?:mot minh|di mot minh|ca nha|hai vo chong|vo chong)\b", f):
            single = re.search(r"\bmot minh\b", f)
            if single:
                patch["party_size"] = 1
            elif re.search(r"\bvo chong\b", f) and not re.search(r"\b\d+\s*nguoi\b", f):
                patch["party_size"] = 2
        pw = re.search(r"\b(" + "|".join(words) + r")\s*(?:nguoi|dua|ban|anh chi em|thanh vien)\b", f)
        if pw and not (money_per and pw.group(1) == "mot"):
            patch["party_size"] = words[pw.group(1)]
        gd = re.search(r"(?<![\d/.,])\b(\d{1,2})\s*(?:dua|ban|thanh vien)\b", f)
        if gd and 1 <= int(gd.group(1)) <= 20 and "party_size" not in patch:
            patch["party_size"] = int(gd.group(1))
    if "party_size" not in patch:
        g = re.search(r"(?<![\d/.,])\b(\d{1,2})\s*ng\b", f)  # "2ng"
        if g and 1 <= int(g.group(1)) <= 20:
            patch["party_size"] = int(g.group(1))
    if "audience" in rx.updated_fields:
        patch["audience"] = p.audience
    if re.search(r"tre nho|em be|tre con|con nho|tre em", f):
        patch["audience"] = "family"
    if re.search(r"\b(?:mot|1) minh\b|\bdi le\b|\bsolo\b", f):  # "một người" appears in per-person budgets and must not mean solo
        patch["audience"] = "solo"
    tastes = re.findall(r"\b(?:it|bot|khong)\s+(?:ngot|cay|man|dau|duong|beo)\b|\ban nhat\b", f)
    if tastes:
        patch["taste"] = ", ".join(dict.fromkeys(tastes))
    if rx.rejected_fields:
        patch["_rejected"] = list(rx.rejected_fields)
    patch.update(coverage.extras(text, f))  # stops / day_part / interests (contract v1.9)
    return patch


# --------------------------------------------------------------------------------------- intent rules
CRITERIA_WORDS = (
    ("distance", r"\bgan\b|xa|khoang cach|it phai di bo|it di bo|di bo it"),
    ("price", r"\bre\b|\bmat\b|gia\b|gia ca|bao nhieu tien|dat"),
    ("rating", r"danh gia|diem\b|ngon hon|tot hon|sao\b"),
    ("audience", r"gia dinh|nhom ban|ban be|tre em|doi tac"),
    ("meal", r"bua (?:sang|trua|toi|xe)"),
    ("parking_car", r"o to|oto|do xe hoi|cho dau"),
    ("outdoor", r"ngoai troi"),
    ("capacity", r"suc chua|ngoi duoc dong|dong nguoi hon|bao nhieu cho|rong"),
    ("prep_time", r"nhanh hon|cho lau|thoi gian cho|len mon"),
    ("hours", r"mo cua|gio mo|dong cua|mo muon|gio hoat dong"),
    ("quiet", r"yen tinh|on ao|im"),
    ("crowd", r"it dong|dong khach|dong duc|vang"),
    ("elderly", r"nguoi lon tuoi|nguoi gia|ong ba|cao tuoi"),
)


def criteria_from(f: str) -> list:
    out = []
    for cid, pat in CRITERIA_WORDS:
        if re.search(pat, f):
            out.append(cid)
    return out[:3]


def negated_dung(text: str, f: str) -> bool:
    """"đừng" (don't) and "đúng" (correct) fold to the same letters: decide from the original accents."""
    low = text.casefold()
    if "đừng" in low:
        return True
    if "đúng" in low:
        return False
    return bool(re.search(r"\bdung\b(?!\s+(?:roi|vay|nhe|r)\b)", f))


def is_negated(text: str, f: str) -> bool:
    return bool(re.search(r"(?<![a-z0-9])(?:khong|ko|thoi|chua|huy|khoan|de sau)(?![a-z0-9])", f)) or negated_dung(text, f)


def has_digits(words) -> bool:
    return any(any(c.isdigit() for c in w) for w in words)


def dish_in(f: str):
    f = re.sub(r"\bpho co\b", " ", f)  # "phố cổ" (old quarter) folds to the same letters as "phở cổ"
    e = knowledge.lookup_dish(f)
    return e[1].lower() if e else None



# --- accent-aware verb classes: "bỏ" (remove) must not match "bồ" (buddy), "thấy" must not match "thay"
_TOK = re.compile(r"[a-zà-ỹđ]+")
VERBS = {"REMOVE": {"bỏ", "bo", "xóa", "xoá", "xoa", "loại", "loai", "gỡ", "go", "remove", "delete", "drop"},
         "ADD": {"thêm", "them", "lấy", "lay", "chọn", "chon", "add", "pick"},
         "KEEP": {"giữ", "giu", "khóa", "khoa", "ghim", "keep", "lock", "pin"},
         "MODIFY": {"đổi", "doi", "thay", "replace", "swap", "change"}}
_NEG_BEFORE = {"đừng", "dung", "không", "khong", "ko", "chưa", "chua", "chớ", "khỏi", "khoi", "đâu", "dont", "don't"}
_DEFER = re.compile(r"(?:trước khi \w+|truoc khi \w+|rồi hẵng|roi hang|chớ chưa|chứ chưa|chu chua|cho chua|để sau|de sau|thêm sau|them sau|sau nhé|sau nha)")
_ACK_EMOJI = re.compile(r"^[\W_]+$")


def trim_deferred(text: str) -> str:
    """Drop clauses the user postpones ("…, thêm quán để sau", "rồi hẵng tìm quán sau", "chớ chưa lập tour")."""
    low = text.strip()
    low = re.sub(r"(?:,\s*)?(?:hỏi\s+)?(?:trước khi|truoc khi)\s+\w+(?:\s+nha|\s+nhé|\s+nhe)?", "", low, flags=re.I)  # "…, hỏi trước khi chọn"
    m = _DEFER.search(low.casefold())
    if m:
        head = low[:m.start()]
        cut = max(head.rfind(","), head.rfind(";"))
        head = (head[:cut] if cut > 0 else head).rstrip(" ,;.")  # the postponed clause goes entirely
        if head:
            return head
    parts = re.split(r"[,;]", low)
    if len(parts) > 1:
        kept = [p for p in parts if not re.search(r"\bsau\s*$", p.strip().casefold())]
        if kept:
            return ",".join(kept)
    return low


def _squash(t: str) -> str:
    return re.sub(r"(.)\1+", r"\1", t)  # "Xoáa", "Giữr"-style key slips: collapse repeated letters


_SQUASHED = {cls: {_squash(w) for w in words} for cls, words in VERBS.items()}


def verb_classes(text: str) -> dict:
    """{class: first token position} of non-negated verbs, from the accented lower-case text."""
    toks = _TOK.findall(text.casefold())
    out = {}
    for i, t in enumerate(toks):
        if i > 0 and (toks[i - 1] in _NEG_BEFORE or (t in ("thêm", "them") and toks[i - 1] in ("có", "co", "còn", "con", "ngoài", "ngoai"))
                      or (t in ("chọn", "chon") and toks[i - 1] in ("đã", "da", "được", "duoc"))):
            continue
        for cls, words in VERBS.items():
            if cls not in out and (t in words or (len(t) > 3 and _squash(t) in _SQUASHED[cls])):
                out[cls] = i
    return out


_HYPO = (r"như thể|nhu the la|giả sử|gia su|giả dụ|gia du|giả như|gia nhu|giá như|ví như|lỡ như|nhỡ như|tưởng tượng|thử nói|đùa thôi|dua thoi|nói đùa|"
         r"nói mỉa|noi mia|mỉa mai|mia mai|sarcasm|phá sản à|ví dụ|vi du|\bvd\b|nếu như|🤣|😂|haha|hehe|=\)\)|:\)\)")
_THIRD = r"(?:bạn|chị|anh|em gái|em trai|mẹ|bố|ba|má|cô|chú|dì|bác|ông|bà|vợ|chồng|con|cháu|người yêu|đồng nghiệp|khách)"
_ABSENT = r"(?:ở nhà|không đi|không tham gia|không có mặt|vắng mặt|không cùng đi|đi vắng|không đi cùng)"


def third_party_head(sentence: str):
    """The companion a sentence is about ("Bạn mình dị ứng tôm" -> "bạn", "Con tôi dị ứng vừng" -> "con"); None for the speaker ("Bạn ơi, mình dị ứng tôm")."""
    low = sentence.casefold()
    m = re.match(r"\s*(" + _THIRD + r")\b(?!\s*(?:ơi|oi|à|ạ|nè|ne|nhé|nhe|,))", low)
    if not m or re.match(r"\s*(?:tôi|mình|em|tui|tớ)\b", low):
        return None
    return m.group(1)


def is_third_party(sentence: str) -> bool:
    return third_party_head(sentence) is not None


def _unquote_foods(text: str) -> str:
    """Mình dị ứng "đậu phộng": a quoted NAME of a major allergen next to an allergy cue is a statement, not a draft or an example."""
    def swap(m):
        inner = m.group(1).strip()
        return inner if (allergens.family_of(inner) and allergens.core_term(inner) == inner) else m.group(0)
    if not safety_parse._ALLERGY.search(text):
        return text
    return re.sub(r"[\"“«]([^\"”»]{1,30})[\"”»]", swap, text)


def _drop_absent(text: str) -> str:
    """An allergy that belongs to someone who is not coming constrains nothing (sentence level)."""
    if not re.search(_ABSENT, text.casefold()):
        return text
    sents = re.split(r"(?<=[.;!?])\s+", text)
    gone = set()
    for sent in sents:
        head = third_party_head(sent)
        if head and re.search(_ABSENT, sent.casefold()) and not safety_parse._ALLERGY.search(sent.casefold()):
            gone.add(head)  # "Chị tôi không đi chuyến này": only 'chị' is absent, not every companion
        last = None
        for clause in re.split(r"(?:,|\s+(?:nhưng|còn|mà|chứ)\s+)", sent):
            h = third_party_head(clause)
            if h and safety_parse._ALLERGY.search(clause.casefold()):
                last = h
            elif re.search(_ABSENT, clause.casefold()) and last and re.match(r"\s*(?:không|ko|chẳng|hôm nay|nhưng)", clause.casefold()):
                gone.add(last)  # "Bạn tôi dị ứng tôm nhưng không đi cùng": the subject-less absence clause is about the same companion
    keep = []
    for sent in sents:
        kept = []
        for clause in re.split(r"(,|\s+(?:nhưng|còn|mà|chứ)\s+)", sent):
            low = clause.casefold()
            head = third_party_head(clause)
            if safety_parse._ALLERGY.search(low) and head and (head in gone or re.search(_ABSENT, low)):
                continue
            kept.append(clause)
        keep.append("".join(kept).strip(" ,"))
    return " ".join(k for k in keep if k).strip()


def effective_text(text: str) -> str:
    """The part of a message the rules actually read: NFC, quoted drafts removed, postponed clauses trimmed."""
    text = safety_parse.normalize_keep_case(text).strip()
    if re.search(r"[\"“”«»]", text):
        unq = re.sub(r"[\"“«][^\"”»]*[\"”»]", " ", text).strip()
        if re.search(r"[A-Za-zÀ-ỹ0-9]", unq):
            text = unq
    return trim_deferred(text)


def understand(text: str, state: ChatState, gz=None, prior: Optional[Preferences] = None, guided: bool = False) -> Understanding:
    u = _understand(text, state, gz, prior, guided)
    if u.intent in ("SEARCH_VENUES", "UPDATE_PROFILE", "DISCOVER_DISH") and u.confidence >= 0.75:
        f = fold_uncached(text)
        signals = sum(bool(re.search(q, f)) for q in (
            r"\bthay vi\b|\bdoi thanh\b|\bdoi sang\b|\bthuc ra\b", r"\bbo\s+\w+\s+di\b|\bdung (?:an|cho)\b", r"\btim\b|\bkiem\b"))
        if signals >= 2:
            u.confidence = 0.5  # several distinct requests in one sentence: let the LLM (or a clarification) sort it out
    return u


def _understand(text: str, state: ChatState, gz=None, prior: Optional[Preferences] = None, guided: bool = False) -> Understanding:
    prior = prior or Preferences()
    text = safety_parse.normalize_keep_case(text).strip()
    if text and not re.search(r"[A-Za-zÀ-ỹ0-9]", text):  # emoji / punctuation only: a reaction, not a request
        return Understanding("AMBIGUOUS_ACK" if not (state.pending and state.pending.kind == "confirm_plan") else "AMBIGUOUS_ACK", confidence=0.7)
    if guided:
        text = _unquote_foods(text)
    if re.search(r"[\"“”«»]", text):
        unquoted = re.sub(r"[\"“«][^\"”»]*[\"”»]", " ", text).strip()  # quoted drafts / examples never act
        if not re.search(r"[A-Za-zÀ-ỹ0-9]", unquoted):
            return Understanding("UNKNOWN", confidence=0.3)
        text = unquoted
    if re.search(_HYPO, text.casefold()) or \
            re.search(r"\bnếu\b[^.?!]{0,80}\b(?:thì sao|thì có sao|thì thế nào|thì có được không|có được không)\b", text.casefold()) or \
            re.search(r"\bnếu\b[^.?!]{0,100}\bthì\b[^.?!]{0,60}(?:\?|\bsao\b|\bgì\b|\bnào\b|\bthế nào\b)", text.casefold()):
        keep = []
        if guided:  # a hypothetical clause never acts, but a real statement next to it still counts (fail closed for allergies)
            hypo = _HYPO + r"|\bnếu\b"
            keep = [c for c in re.split(r"[,;.!?\n]+|\s+(?:còn|nhưng|mà|chứ)\s+", text) if c.strip() and not re.search(hypo, c.casefold()) and not re.search(r"(?:không|chẳng|đâu|chưa)\s+phải", c.casefold())]
            if not any(safety_parse._ALLERGY.search(c) for c in keep):
                keep = []
        if not keep:
            return Understanding("AMBIGUOUS_ACK", confidence=0.7)  # hypothetical / joking wording: never act
        text = ", ".join(keep)
    if guided:  # an allergy of someone who is not coming constrains nothing
        pre = _drop_absent(text)
        if pre != text.strip():
            if not re.search(r"[A-Za-zÀ-ỹ0-9]", pre):
                return Understanding("GREET_OR_SMALLTALK", {"absent_allergy": True}, confidence=0.8)
            text = pre
    if guided and re.search(r"\bnếu\b", text.casefold()) and safety_parse._ALLERGY.search(text.casefold()):
        parts = re.split(r"([,;.!?\n]+|\s+(?:còn|nhưng|mà|chứ)\s+)", text)
        text = "".join(p for i, p in enumerate(parts) if not (i % 2 == 0 and re.search(r"\bnếu\b", p.casefold()) and safety_parse._ALLERGY.search(p.casefold()))).strip(" ,;.") or text
    raw_safety = text  # the safety parser reads the WHOLE message (quotes already removed): a postponed clause may still carry an allergy
    text = trim_deferred(text)
    f = fold_uncached(text)
    f = re.sub(r"\b(?:khong|chua|dung|dung vo)\s+can\s+(?:phai\s+)?(?:tim|kiem)\b", " ", f)  # "không cần tìm …" is not a search
    words = f.split()
    pending = state.pending

    if not words:
        return Understanding("UNKNOWN", confidence=0.0)
    if re.search(r"\b(?:bo qua|ignore|disregard|system|prompt|reveal|jailbreak)\b", f) and \
            re.search(r"\b(?:an toan|xac nhan|quy tac|moi quy tac|instructions?|rules?|prompt|api|verified|key)\b", f):
        if guided:
            sp0 = safety_parse.parse(raw_safety)
            if sp0.allergies:  # the override request is refused, but the allergy it carried is still the user's statement
                return Understanding("SET_ALLERGY", {}, [], 0.9, extra={"safety": sp0, "unsafe_notice": True})
        return Understanding("UNSAFE")
    if re.search(r"api[ _-]?key|chi dan he thong|prompt he thong|system prompt|mat khau|\btoken\b.*\bin\b|\bin\b.*(?:key|chi dan)", f):
        return Understanding("UNSAFE")
    if re.search(r"\ban toan (?:cho|voi)\b", f):
        return Understanding("ASK_DETAIL", {"field": "allergy_safety"}, parse_refs(text, f), 0.9)

    sp = safety_parse.parse(raw_safety if guided else text)
    if guided and sp.avoid and not pending:
        hard = [t for t in sp.avoid_hard if allergens.family_of(t)]  # "không ăn được lạc", "kiêng trứng": a named major allergen is treated as an allergy ("ghét trứng" stays a dislike)
        if hard:
            sp.allergies += [t for t in hard if t not in sp.allergies]
            sp.avoid = [t for t in sp.avoid if t not in hard]
            sp.avoid_any = [t for t in sp.avoid_any if t not in hard]
    if guided and sp.negated and sp.negated_terms and not sp.allergies:
        sp.removed += [t for t in sp.negated_terms if t not in sp.removed]  # "không bị dị ứng tôm" retracts tôm only
    if guided and sp.avoid_vague and not (sp.allergies or sp.avoid):
        sp.issues.append("vague")  # it may be an allergy: ask which food instead of dropping it
    if guided:
        alt = re.search(r"dị ứng\s+(.+?)\s+chứ\s+không\s+phải\s+(.+?)(?:[,.;!?]|$)", text.casefold())
        if alt and allergens.family_of(alt.group(1)) and allergens.family_of(alt.group(2)):
            sp = safety_parse.SafetyParse(mentioned=True, allergies=[alt.group(1).strip()], removed=[alt.group(2).strip()])  # "dị ứng vừng chứ không phải hạt điều"
        fix = re.search(r"không phải\s+(.+?)\s+mà\s+(?:là\s+)?(.+?)(?:[,.;!?]|$)", text.casefold())
        if fix:  # "không phải tôm mà là lạc, mình nói nhầm"
            wrong, right = fix.group(1).strip(), fix.group(2).strip()
            if allergens.family_of(wrong) and allergens.family_of(right):
                sp = safety_parse.SafetyParse(mentioned=True, allergies=[right], removed=[wrong])
        last_user = next((t for t in reversed(state.turns) if t.get("role") == "user"), None)
        short = len(text.split()) <= 6
        if short and last_user and last_user.get("intent") == "SET_ALLERGY" and not sp.allergies and re.search(r"\b(?:thêm|nữa|cả|luôn)\b", text.casefold()):
            more, _ = safety_parse._scan(safety_parse._clean_words(text))  # "À thêm sữa nữa" right after an allergy statement
            if more:
                sp = safety_parse.SafetyParse(mentioned=True, allergies=more)
        ahead = third_party_head(text)
        if ahead and any(a.who == ahead for a in state.allergies) and not safety_parse._ALLERGY.search(text.casefold()) and re.search(_ABSENT, text.casefold()):
            return Understanding("GREET_OR_SMALLTALK", {"absent_person": ahead}, confidence=0.8)  # "Bạn ấy ở nhà không đi cùng nhé": only that companion's allergies go
    refs = parse_refs(text, f)
    patch = parse_slots(text, f, prior)
    if re.search(r"\bda (?:goi|hoi|lien he)\b", f) and refs:
        return Understanding("SET_ALLERGY", patch, refs, 0.9,
                             extra={"safety": sp, "venue_confirmation": refs[0], "said": text[:160]})
    if pending and pending.kind == "clarify_intent":
        early = _answer(text, f, refs, patch, pending, state)
        if early:
            return early

    # place mentions
    out = gz.outside(f) if gz else None
    place = gz.resolve(text) if gz else None
    if out:
        return Understanding("OUT_OF_SCOPE", {"reason": "outside_hanoi", "place": out})
    if place and not re.search(r"\bthoi tiet\b", f):
        patch["area"] = place.to_json()

    if refs and re.search(r"\bco\b.*\b(?:khong|chu)\b", f) and not re.search(r"\b(?:them|bo|giu|doi|thay)\b", f):
        return Understanding("ASK_DETAIL", {**patch, "field": "amenity"}, refs, 0.85)
    # --- out of scope signals
    if re.search(r"thoi tiet|troi (?:co )?(?:mua|nang|lanh)|bao nhieu do|may do\b|\bmua khong\b|co mua", f) and not _w(f, "nong", "lanh") \
            or re.search(r"\bmai troi\b|\bhom nay bao nhieu\b", f):
        return Understanding("OUT_OF_SCOPE", {"reason": "no_weather_data"})
    if re.search(r"\bpay (?:the )?bill\b|\btra tien\b|\bdat ban\b|\bbook (?:a )?table\b|\breservation\b|\bdat grab\b|\bdat xe\b|thanh toan|luu tour|chia se|gui link", f):
        return Understanding("OUT_OF_SCOPE", {"reason": "not_supported_yet"})
    if re.search(r"bai toan|viet tho|lap trinh|dich giup|lop \d", f):
        return Understanding("OUT_OF_SCOPE", {"reason": "off_topic"})

    # --- safety statements first
    if sp.negated and not (sp.allergies or sp.avoid or sp.avoid_any or sp.removed or sp.issues):
        return Understanding("GREET_OR_SMALLTALK", {**patch, "no_allergy": True}, confidence=0.9)  # "không bị dị ứng gì"
    if sp.allergies or sp.removed or "empty" in sp.issues or "people" in sp.issues or "long" in sp.issues or "vague" in sp.issues or "example" in sp.issues:
        extra = {"safety": sp}
        conf = re.search(r"da (?:goi|hoi|lien he)|quan noi", f)
        if conf and refs:
            extra["venue_confirmation"] = refs[0]
        return Understanding("SET_ALLERGY", {**patch}, refs, 0.95, extra=extra)
    if (sp.avoid or sp.avoid_any) and not pending and not (refs and re.search(r"\b(?:go|bo|xoa|loai)\b", f)):
        if re.search(r"khau vi|so thich|\bgu\b|cap nhat|ghi nho", f) and not sp.avoid:
            return Understanding("UPDATE_PROFILE", {**patch, "dislike": ", ".join(sp.avoid_any)[:40]}, refs, 0.8)
        return Understanding("SET_AVOID", patch, refs, 0.9, extra={"safety": sp})

    # --- pending answers
    if pending:
        ans = _answer(text, f, refs, patch, pending, state)
        if ans:
            return ans

    ACK_BASE = {"ok", "oke", "okie", "okay", "u", "um", "uhm", "uh", "ua", "uk", "vang", "da", "duoc", "dong", "y", "co", "ung", "dung", "chuan", "chot"}
    ACK_FILL = {"nha", "nhe", "nhi", "ban", "roi", "vay", "di", "luon", "a", "do", "oi", "ne", "thoi", "o", "ke", "nao", "cung", "duoc"}
    ack = not place and bool(words) and len(words) <= 5 and all(w in ACK_BASE or w in ACK_FILL for w in words) and any(w in ACK_BASE for w in words) \
        and not has_digits(words)
    no = (re.match(r"(?:khong|ko|chua|thoi|that khong)\b", f) and len(words) <= 5
          and not re.search(r"khong (?:an|thich|muon|qua)|\d", f))

    low0 = text.casefold()
    if "đói quá" in low0 or "doi qua" in low0:
        return Understanding("DISCOVER_DISH", patch, refs, 0.8)
    if re.search(r"chi dang nghi|dang soan|\bde hoi lai\b|chua quyet|chua thong nhat|chua dong y|con (?:dang )?can nhac|doi chut|nhan duoc roi|cho minh .{0,12}(?:suy nghi|xem lai|doc)|mot phut|doc ky|"
                 r"\bneu\b.*\bthi sao\b|\bde (?:em|minh|tui|toi) nghi\b", f) or \
            ("nghi them" in f and "nghị" not in low0) or re.search(r"xin (?:đợi|doi)\b", low0):
        return Understanding("AMBIGUOUS_ACK", confidence=0.75)
    if len(verb_classes(text)) >= 2 and re.search(r"\bhay\b", f) and (re.search(r"\bnhi\b|\bnhe\b", f) or "?" in text):
        return Understanding("UNKNOWN", confidence=0.3)  # "giữ hay đổi … nhỉ?": the user is undecided, never act
    # --- action verbs
    has_plan = re.search(r"\b(?:tao|lap|xep|sap|len|ghep)\b(?:\s+\w+){0,3}?\s+(?:lich|tour|lich trinh|hanh trinh|ke hoach)\b|"
                        r"\bcho minh lich\b|\blap tour\b|\btao tour\b", f)
    if has_plan and is_negated(text, f):
        if pending:
            return Understanding("CONFIRM_NO", patch, refs, 0.9)  # negated plan request
        has_plan = None  # "…, chưa lập tour": the remaining request still counts
    if has_plan:
        if pending and pending.kind == "confirm_plan":
            return Understanding("CONFIRM_YES", patch, refs, 0.9)
        return Understanding("REQUEST_PLAN", patch, refs, 0.9)
    if ack:
        return Understanding("AMBIGUOUS_ACK" if not pending or pending.kind != "confirm_plan" else "CONFIRM_YES", confidence=0.9)
    if no and pending:
        return Understanding("CONFIRM_NO", confidence=0.85)
    crit = criteria_from(f)
    if re.search(r"\b(?:khoi|dung|khong can)\s+so sanh\b", f):
        f = re.sub(r"\b(?:khoi|dung|khong can)\s+so sanh(?:\s+nua)?\b", " ", f)
    elif re.search(r"so sanh|\bcompare\b|\bdoi chieu\b|\bso (?:ve|theo|voi)\b|\bdat\b.*\bcanh\b", f) or (len(refs) >= 2 and re.search(r"hon\b|hay\b|nao|\bso\b", f)) or \
            re.search(r"(?<!co )\bquan nao\b.*\b(?:gan|re|mat|tot|ngon|nhanh|yen|dong|it|nhieu)\b", f):
        only_unsup = crit and all(c in tools.UNSUPPORTED for c in crit)
        if only_unsup and not refs and not state.last_results and "so sanh" not in f:
            return Understanding("SEARCH_VENUES", {**patch, "unsupported": crit}, refs, 0.8)
        return Understanding("COMPARE", {**patch, "criteria": crit}, refs, 0.9)
    low = text.casefold()
    vc = verb_classes(text)
    if re.search(r"\bvao (?:danh sach|tour|list)\b|\bcho\b.*\bvao\b", f) and "ADD" not in vc and not is_negated(text, f):
        vc["ADD"] = f.find("vao")
    slotty = any(k in patch for k in ("party_size", "budget_vnd", "start_time", "end_time", "duration_min", "vehicle", "max_leg_min")) and not refs
    if slotty:
        vc = {}  # "giữ 2 người, đổi 480k": the verbs belong to profile edits, not to the shortlist
    if refs and re.search(r"(?<![a-z])(?:dung|khong|ko|cho|chớ)\b.{0,12}\b(?:thay|doi|bo|xoa|loai)\b", f) and not vc.get("ADD"):
        return Understanding("KEEP", patch, refs, 0.8)  # "đừng thay B trong tour"
    first = min(vc, key=lambda k: vc[k]) if vc else None
    ask_q = bool(refs) and bool(re.search(r"\bco\b.*\b(?:khong|chu)\b|\bkhong\b.*\bvay\b|\bnhu the nao\b|\bra sao\b", f)) and not vc.get("ADD") and not vc.get("REMOVE")
    if "REMOVE" in vc and first in ("REMOVE", None) or ("REMOVE" in vc and first != "REMOVE" and first in ("MODIFY",) and False):
        pass
    if vc.get("REMOVE") is not None and first == "REMOVE" and not re.search(r"\bbo qua\b", f) and (refs or "danh sach" in f or "quan nay" in f or "da chon" in f):
        return Understanding("REMOVE", patch, refs, 0.9)
    if re.search(r"\bkhong lay\b", f) and ("nua" in f):
        return Understanding("REMOVE", patch, refs, 0.8)
    if "MODIFY" in vc and first == "MODIFY" and (refs or "tour" in f) and not re.search(r"\bthay\b.*\b(?:bun|pho)\b", f):
        return Understanding("MODIFY_PLAN", patch, refs, 0.8)
    if first == "KEEP" or re.search(r"nhat dinh phai co|luon giu|phai co trong tour|luu lai", f):
        return Understanding("KEEP", patch, refs, 0.9)
    if ask_q:
        fld = ("parking_car" if re.search(r"gui xe|do xe|cho de xe|bai xe", f) else "hours" if re.search(r"mo cua|gio", f) else
               "price" if re.search(r"\bgia\b|bao nhieu", f) else "amenity")
        return Understanding("ASK_DETAIL", {**patch, "field": fld}, refs, 0.85)
    if refs and "?" in text and not vc and not re.search(r"so sanh|compare|doi chieu", f):
        return Understanding("ASK_DETAIL", {**patch, "field": "detail"}, refs, 0.7)
    if "MODIFY" in vc and (refs or "tour" in f) and not re.search(r"\bthay\b.*\b(?:bun|pho)\b", f) and first != "ADD":
        return Understanding("MODIFY_PLAN", patch, refs, 0.8)
    if re.search(r"\bbot\b.*\bdiem dung\b|\bbot mot diem\b", f):
        return Understanding("MODIFY_PLAN", patch, refs, 0.8)
    dish = dish_in(f)
    if dish:
        patch["dish"] = dish
    if re.search(r"\bthay\b", f) and dish and not refs:
        dishes = [d[1].lower() for d in knowledge.DISHES if any((" " + q + " ") in (" " + f + " ") for q in d[5])]
        return Understanding("UPDATE_PROFILE", {**patch, "dish_replace": dishes}, refs, 0.8)
    if negated_dung(text, f) and re.search(r"\bdung\b\s+(?:cho\s+)?(?:quan\s+)?", f) and dish and not refs:
        return Understanding("UPDATE_PROFILE", {**patch, "dislike": dish}, refs, 0.8)
    if re.search(r"\bvao (?:danh sach|tour|list)\b", f) and refs:
        return Understanding("ADD", patch, refs, 0.85)
    if ("ADD" in vc or re.search(r"\bbo sung\b", f)) and \
            (refs or (dish and not re.search(r"tim (?:them|tiep)|xem them|cho xem them", f))
             or re.search(r"\b(?:them|lay|chon)\s+(?:mot\s+)?quan\b(?!\s+\w)", f)):
        extra = {"then_search": True} if refs and re.search(r"\btim\b", f) else {}
        return Understanding("ADD", patch, refs, 0.9, extra=extra)
    asks = re.search(r"mo cua|gio mo|dong cua|gio dong|may gio|what time|\bgia\b|dia chi|co cho dau|chi tiet|thong tin|menu|thuc don|ban gi|co ban\b|an toan cho|bao nhieu|"
                     r"payment|thanh toan|tien mat|may i ask|\bwhere\b|o dau|"
                     r"\bco (?:wifi|may lanh|dieu hoa|ban ngoai troi|phong rieng|cho do)\b|\bco \w+(?: \w+)? khong\b", f)
    if asks and (refs or "quan nay" in f):
        field_ = ("hours" if re.search(r"mo cua|gio mo|may gio", f) else "price" if re.search(r"\bgia\b|bao nhieu", f) else
                  "address" if "dia chi" in f else "parking_car" if re.search(r"o to|oto|cho dau", f) else
                  "allergy_safety" if "an toan" in f else "menu" if re.search(r"menu|thuc don|ban gi|it duong|co ban\b", f) else "detail")
        return Understanding("ASK_DETAIL", {**patch, "field": field_}, refs, 0.85)
    if re.search(r"^(?:xin chao|chao|hello|hi|hey|alo)\b|\bcam on\b|\btam biet\b|\bthanks\b|\bthank you\b", f):
        return Understanding("GREET_OR_SMALLTALK", confidence=0.9)

    # --- discover vs search vs profile
    discover = re.search(r"\ban gi\b|\bmon gi\b|\bmon nao\b|goi y mon|nen an|dang thu|\bla gi\b|co mon nao|an vat gi|"
                         r"mon (?:mat|am|nhe)|an sang|an trua|an toi|muon an gi|an gi do|di an dau|an dau\b|y tuong (?:mon|an)|mon an|dac san|"
                         r"\bke (?:cho|mon|ve)\b", f)
    mood = ("cool" if re.search(r"\bnong\b|\bmat\b", f) else "warm" if re.search(r"\blanh\b|\bam\b", f) else
            "light" if re.search(r"nhe nhe|\bnhe\b", f) else None)
    if mood:
        patch["mood"] = mood
    meal = ("breakfast" if re.search(r"\bsang\b", f) else "lunch" if re.search(r"\btrua\b", f) else
            "dinner" if re.search(r"\btoi\b", f) else None)
    if meal:
        patch["meal"] = meal
    search_strong = re.search(r"\bsearch\b|\bfind\b|\btim\b|(?<!hoan )\bkiem\b|\bquan\b|goi y quan|\bco quan\b|\bchi\b.*\bnao\b|cho an|chu nao|"
                              r"\bxem them\b|quan nao ngon", f)
    search = search_strong or re.search(r"gan day|quanh day|\bgan toi\b", f)
    unsupported = [c for c in criteria_from(f) if c in tools.UNSUPPORTED]
    if unsupported:
        patch["unsupported"] = unsupported
    if "radius" not in patch:
        r = re.search(r"(?:trong|ban kinh|cach)\s+(\d+)\s*(m|km|met)\b", f)
        if r:
            patch["radius_m"] = int(r.group(1)) * (1000 if r.group(2) == "km" else 1)
    pr = re.search(r"(?:duoi|toi da|khong qua)\s+(\d+)\s*(k|nghin|ngan|tr|trieu)\b", f)
    if pr and search:
        patch["budget_vnd"] = int(pr.group(1)) * (1_000_000 if pr.group(2) in ("tr", "trieu") else 1000)
    for k, pat in (("parking_car", r"cho (?:dau|do) (?:o to|oto|xe hoi)|o to"), ("outdoor", r"ban ngoai troi|ngoai troi")):
        if search and re.search(pat, f):
            patch["amenity"] = k
    if "gia dinh" in f and search:
        patch["audience"] = "family"
    if re.search(r"nhom ban|ban be", f) and search:
        patch["audience"] = "friends"
    slot_keys = [k for k in patch if k in ("party_size", "budget_vnd", "budget_scope", "start_time", "end_time", "duration_min",
                                           "vehicle", "max_leg_min", "audience", "taste", "area")]
    if discover and not search_strong:
        return Understanding("DISCOVER_DISH", patch, refs, 0.85)
    if search or (dish and "quan" in f):
        return Understanding("SEARCH_VENUES", patch, refs, 0.85)
    if slot_keys or patch.get("_rejected"):
        return Understanding("UPDATE_PROFILE", patch, refs, 0.8)
    if re.search(r"\bkhong thich\b", f):
        what = re.sub(r"^(?:an|uong|do|mon)\s+", "", f.split("khong thich", 1)[1].strip())
        what = re.split(r"\b(?:nen|thi|dau|nhe|nha|vi|nhung|vay|nua)\b", what)[0].strip()[:40]
        if re.search(r"khau vi|so thich|\bgu\b|cap nhat|ghi nho", f):
            return Understanding("UPDATE_PROFILE", {**patch, "dislike": what}, refs, 0.8)
        return Understanding("SET_AVOID", {**patch, "dislike": what}, refs, 0.85)
    if re.search(r"lam lai tu dau|bat dau lai|reset", f):
        return Understanding("UPDATE_PROFILE", {"reset": True}, refs, 0.9)
    if dish:
        return Understanding("SEARCH_VENUES", patch, refs, 0.6)
    if discover:
        return Understanding("DISCOVER_DISH", patch, refs, 0.7)
    if re.search(r"\bdoi\b|\bdoi qua\b|\bdoi bung\b|\bdoi lam\b", f) or "an gi" in f:
        return Understanding("DISCOVER_DISH", patch, refs, 0.6)
    if refs and state.last_results and not pending and len(words) <= 4 and all(w in ("a", "b", "c", "d", "e", "thoi", "nhe", "nha", "ban", "di", "vay", "lay", "cai", "quan", "ok") for w in words):
        return Understanding("ADD", patch, refs, 0.7)  # "A thôi", "B nhé bạn"
    if words and (words[0] in ACK_START or words[0].startswith("ok")) and len(words) <= 7 and not has_digits(words) and not refs and not dish:
        return Understanding("AMBIGUOUS_ACK", confidence=0.7)  # "ừm cũng được á, để tui nghĩ thêm"
    return Understanding("UNKNOWN", patch, refs, 0.2)


def _answer(text, f, refs, patch, pending, state) -> Optional[Understanding]:
    """Bind a reply to the open question; returns None when it is not an answer."""
    if pending.kind == "confirm_plan":
        negated = is_negated(text, f) or re.search(r"(?<![a-z0-9])(?:bo|chan)(?![a-z0-9])", f)
        YES = {"co", "ok", "oke", "okie", "okay", "dung", "roi", "xac", "nhan", "dong", "y", "chot", "duoc", "u", "um", "vang", "da", "tao", "di",
               "luon", "nhe", "nha", "ne", "ban", "nhi", "cu", "lam", "tour", "nay", "lich", "chap", "dc"}
        fw = f.split()
        if not negated and not (len(fw) > 3 and not any(w in ("xac", "chot", "tao", "lap") for w in fw)) and all(w in YES for w in fw):
            return Understanding("CONFIRM_YES", confidence=0.95)
        if (not negated and len(fw) <= 9 and re.search(r"\b(?:dong y|chap nhan|xac nhan|chot|tao (?:tour|lich)|lap (?:tour|lich))\b", f)
                and not re.search(r"\d|sua|doi|them|bo\b|nhung|nhung ma|doc|xem|nghi|cho", f)):
            return Understanding("CONFIRM_YES", confidence=0.95)
        if negated and re.search(r"(?:tao|lap|xep|len)\s+(?:lai\s+)?(?:lich|tour|lich trinh|ke hoach)|xac nhan|\bchot\b|\btao\b", f):
            return Understanding("CONFIRM_NO", confidence=0.95)  # "thôi đừng lập tour nữa" must never plan
        if not negated and re.search(r"\b(?:xac nhan|tao di|chot)\b", f):
            return Understanding("CONFIRM_YES", confidence=0.95)
        if re.match(r"(?:khong|chua|thoi|de minh (?:sua|chon lai|doi)|cho minh sua|sua)\b", f) and len(f.split()) <= 8 and not re.search(r"\d|qua|muon", f):
            return Understanding("CONFIRM_NO", confidence=0.9)
        return None  # edits to the profile keep the confirmation open
    if pending.kind == "clarify_slot":
        slots = {k: v for k, v in patch.items() if not k.startswith("_")}
        if pending.slot == "budget_scope":
            if re.search(r"ca nhom|ca chuyen|theo nhom|tong|ca ban|chung", f):
                slots["budget_scope"] = "group"
            elif re.search(r"moi nguoi|theo nguoi|mot nguoi|dau nguoi", f):
                slots["budget_scope"] = "per_person"
        if pending.slot in ("allergy_confirm", "propose", "allergy_clear"):
            yes = r"\b(?:dung|co|ok|oke|duoc|vang|u|um|dong y|dung roi)\b"
            no = r"\b(?:khong|ko|chua|thoi|sai)\b"
            ids = {"allergy_confirm": ("allergy_ok", "allergy_no"), "propose": ("propose:use", "propose:self"),
                   "allergy_clear": ("allergy_clear:yes", "allergy_clear:no")}[pending.slot]
            if pending.slot == "allergy_clear":
                ids = (ids[1], ids[0])  # "không" = keep the list; "đúng/bỏ" = clear it
                if re.search(r"\b(?:bo|xoa|het|khong con)\b", f) and not re.search(r"\bkhong bo\b|\bdung bo\b", f):
                    return Understanding("ANSWER_PENDING", {"option": "allergy_clear:yes"}, refs, 0.9)
            if re.search(no, f) and not is_negated(text, f):
                return Understanding("ANSWER_PENDING", {"option": ids[1]}, refs, 0.9)
            if re.search(yes, f) and len(f.split()) <= 6:
                return Understanding("ANSWER_PENDING", {"option": ids[0]}, refs, 0.9)
            return None
        if pending.slot == "start_time" and "start_time" not in slots:
            m = re.search(r"\b([01]?\d|2[0-3])\s*(?:h|gio|:)\s*([0-5]\d)?\b", f)
            if m:
                hh, mm = int(m.group(1)), int(m.group(2) or 0)
                part = state.profile["day_part"].value
                if hh < 12 and (part in ("evening", "afternoon", "late") or re.search(r"\b(?:toi|chieu)\b", f)) and hh >= 1:
                    hh += 12
                slots["start_time"] = f"{hh % 24:02d}:{mm:02d}"
        if pending.slot == "allergy_term":
            # A profile edit is not an allergen answer. In particular "ngân sách"
            # folds to "ngan", which must never be mistaken for the duck alias.
            numeric = any(k in slots for k in ("budget_vnd", "budget_scope", "duration_min", "party_size", "stops", "start_time", "end_time", "max_leg_min"))
            if not re.search(r"\bdi ung\b", f) and (numeric or re.search(r"\b(?:ngan sach|tui tien|thoi gian|thoi luong|so nguoi|so quan)\b", f)):
                return None
            terms = safety_parse.parse("di ung " + text).allergies
            plain = text.strip()
            junk = {"lap", "tao", "tour", "lich", "trinh", "ok", "oke", "okay", "di", "thoi", "xac", "nhan", "chot", "co", "khong", "ko", "u", "um", "vang", "da",
                    "roi", "xong", "tiep", "tuc", "bo", "qua", "sau", "hoi", "biet", "nho", "ro", "chua", "gi", "nao", "cai", "nay", "kia", "do", "ke"}
            cand = terms[0] if terms else plain
            cf = set(fold_uncached(cand).split())
            ok_free = len(cf) <= 2 and not re.search(r"\d", cand) and not (junk & cf) and not (safety_parse._VAGUE & cf)
            raw = cand if (allergens.recognised(cand) or ok_free) else ""
            if raw:
                return Understanding("ANSWER_PENDING", {"allergy_text": raw[:40]}, refs, 0.9)
            return None
        if slots:
            return Understanding("ANSWER_PENDING", slots, refs, 0.9)
        return None
    if pending.kind == "clarify_intent":
        opts = {o["option_id"]: fold_uncached(o["label"]) for o in pending.options}
        pick = None
        if re.search(r"\bdi ung\b", f) and "allergy" in opts:
            pick = "allergy"
        elif re.search(r"khong thich|chi la khong|so thich", f) and "dislike" in opts:
            pick = "dislike"
        elif re.search(r"\b(?:chon|lay)\s+(?:quan\s+)?[a-e]\b|chon quan", f) and "choose_venue" in opts:
            pick = "choose_venue"
        elif re.search(r"lap lich|lap tour|tao lich|tao tour|lap lich trinh", f) and "plan" in opts:
            pick = "plan"
        elif re.search(r"\btim\b.*quan|\bquan\b.*gan", f) and "search" in opts and not dish_in(f):
            pick = "search"
        elif re.search(r"goi y mon|mon gi|an gi", f) and "discover" in opts:
            pick = "discover"
        else:
            for oid, lab in opts.items():
                if lab and lab in f:
                    pick = oid
                    break
            if not pick and refs and refs[0].isdigit() and 1 <= int(refs[0]) <= len(pending.options):
                pick = pending.options[int(refs[0]) - 1]["option_id"]
        if pick:
            return Understanding("ANSWER_PENDING", {"option": pick}, refs, 0.9)
        return None
    if pending.kind == "pick_venue":
        if refs:
            return Understanding("ANSWER_PENDING", {}, refs, 0.9)
        return None
    return None
