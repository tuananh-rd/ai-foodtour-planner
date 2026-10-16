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
from app.planner.relevance import fold_uncached
from app.planner.types import Preferences
from . import knowledge, tools
from .state import ChatState

INTENTS = ("GREET_OR_SMALLTALK", "DISCOVER_DISH", "SEARCH_VENUES", "COMPARE", "ADD", "REMOVE", "KEEP", "UPDATE_PROFILE",
           "SET_ALLERGY", "SET_AVOID", "ANSWER_PENDING", "CONFIRM_YES", "CONFIRM_NO", "AMBIGUOUS_ACK", "REQUEST_PLAN",
           "MODIFY_PLAN", "ASK_DETAIL", "OUT_OF_SCOPE", "UNSAFE", "UNKNOWN")
CONFIDENT = 0.75


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

    for m in re.finditer(r"(?:quan|cai|diem|cho)\s+thu\s+(nhat|hai|ba|bon|tu|nam|\d{1,2})\b", folded):
        refs.append(num(m.group(1)))
    for m in re.finditer(r"(?:^|\s)(?:thu)\s+(nhat|hai|ba|bon|nam|\d{1,2})\b", folded):
        if len(folded.split()) <= 6 and num(m.group(1)) not in refs:
            refs.append(num(m.group(1)))
    if re.search(r"(?:quan|cai|diem)\s+(?:dau tien|dau)\b|\bcai (?:dau|nhat)\b|\bdau tien\b", folded):
        refs.append("1")
    if re.search(r"(?:quan|cai|diem)\s+(?:cuoi cung|cuoi)\b|\bcuoi cung\b", folded):
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


def parse_vehicle(f: str) -> Optional[str]:
    if re.search(r"\bdi bo\b|\bbo bo\b|\bdi chan\b", f):
        return "walk"
    if re.search(r"xe may|\bxe om\b", f):
        return "motorbike"
    if re.search(r"\bo to\b|\boto\b|xe hoi|\bxe 4 cho\b", f):
        return "car"
    if re.search(r"\bgrab\b|\btaxi\b|\bbe\b|\bxanh sm\b", f):
        return "taxi"
    return None


def parse_slots(text: str, f: str, prior: Preferences) -> dict:
    """Profile patch from explicit statements."""
    patch = {}
    patch.update(parse_times(f))
    veh = parse_vehicle(f)
    if veh:
        patch["vehicle"] = veh
    m = re.search(r"khong\s+(?:muon\s+)?(?:di bo\s+)?(?:qua|hon)\s+(\d{1,2})\s*phut", f)
    if m and 3 <= int(m.group(1)) <= 60:
        patch["max_leg_min"] = int(m.group(1))
    # numbers (party size, budget, duration) via the existing rule extractor, with the time phrases removed first
    stripped = re.sub(r"(?:tu|luc|bat dau|xuat phat|di luc|ket thuc|xong|ve)?\s*(?:truoc\s*)?\d{1,2}\s*(?:gio|h)\s*\d{0,2}"
                      r"(?:\s*(?:den|toi|-)\s*\d{1,2}\s*(?:gio|h)\s*\d{0,2})?", " ", f)
    rx = MockExtractor().extract(stripped if stripped.strip() else "", Preferences())
    p = rx.preferences
    if "party_size" in rx.updated_fields:
        patch["party_size"] = p.party_size
    if "budget_vnd" in rx.updated_fields:
        patch["budget_vnd"] = p.budget_vnd
        if p.budget_scope:
            patch["budget_scope"] = p.budget_scope
    elif "budget_scope" in rx.updated_fields:
        patch["budget_scope"] = p.budget_scope
    if "duration_min" in rx.updated_fields and "end_time" not in patch:
        patch["duration_min"] = p.duration_min
    if "audience" in rx.updated_fields:
        patch["audience"] = p.audience
    if re.search(r"tre nho|em be|tre con|con nho|tre em", f):
        patch["audience"] = "family"
    if re.search(r"\b(mot|1) (?:minh|nguoi)\b|\bmot minh\b", f):
        patch["audience"] = "solo"
    tastes = re.findall(r"\b(?:it|bot|khong)\s+(?:ngot|cay|man|dau|duong|beo)\b|\ban nhat\b", f)
    if tastes:
        patch["taste"] = ", ".join(dict.fromkeys(tastes))
    if rx.rejected_fields:
        patch["_rejected"] = list(rx.rejected_fields)
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


def dish_in(f: str):
    f = re.sub(r"\bpho co\b", " ", f)  # "phố cổ" (old quarter) folds to the same letters as "phở cổ"
    e = knowledge.lookup_dish(f)
    return e[1].lower() if e else None


def understand(text: str, state: ChatState, gz=None, prior: Optional[Preferences] = None) -> Understanding:
    u = _understand(text, state, gz, prior)
    if u.intent in ("SEARCH_VENUES", "UPDATE_PROFILE", "DISCOVER_DISH") and u.confidence >= 0.75:
        f = fold_uncached(text)
        signals = sum(bool(re.search(q, f)) for q in (
            r"\bthay vi\b|\bdoi thanh\b|\bdoi sang\b|\bthuc ra\b", r"\bbo\s+\w+\s+di\b|\bdung (?:an|cho)\b", r"\btim\b|\bkiem\b"))
        if signals >= 2:
            u.confidence = 0.5  # several distinct requests in one sentence: let the LLM (or a clarification) sort it out
    return u


def _understand(text: str, state: ChatState, gz=None, prior: Optional[Preferences] = None) -> Understanding:
    prior = prior or Preferences()
    text = safety_parse.normalize_keep_case(text).strip()
    f = fold_uncached(text)
    words = f.split()
    pending = state.pending

    if not words:
        return Understanding("UNKNOWN", confidence=0.0)
    if re.search(r"\b(?:bo qua|ignore|disregard|system|prompt|reveal|jailbreak)\b", f) and \
            re.search(r"\b(?:an toan|xac nhan|quy tac|moi quy tac|instructions?|rules?|prompt|api|verified|key)\b", f):
        return Understanding("UNSAFE")
    if re.search(r"\ban toan (?:cho|voi)\b", f):
        return Understanding("ASK_DETAIL", {"field": "allergy_safety"}, parse_refs(text, f), 0.9)

    sp = safety_parse.parse(text)
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

    # --- out of scope signals
    if re.search(r"thoi tiet|troi (?:co )?(?:mua|nang|lanh)|bao nhieu do|may do\b|\bmua khong\b|co mua", f) and not _w(f, "nong", "lanh") \
            or re.search(r"\bmai troi\b|\bhom nay bao nhieu\b", f):
        return Understanding("OUT_OF_SCOPE", {"reason": "no_weather_data"})
    if re.search(r"\bdat ban\b|\bdat grab\b|\bdat xe\b|thanh toan|luu tour|chia se|gui link", f):
        return Understanding("OUT_OF_SCOPE", {"reason": "not_supported_yet"})
    if re.search(r"bai toan|viet tho|lap trinh|dich giup|lop \d", f):
        return Understanding("OUT_OF_SCOPE", {"reason": "off_topic"})

    # --- safety statements first
    if sp.mentioned and not (sp.allergies or sp.avoid or sp.removed or sp.issues):
        return Understanding("GREET_OR_SMALLTALK", {"no_allergy": True}, confidence=0.9)  # "không bị dị ứng gì"
    if sp.allergies or sp.removed or "empty" in sp.issues or "people" in sp.issues or "long" in sp.issues or "example" in sp.issues:
        extra = {"safety": sp}
        conf = re.search(r"da (?:goi|hoi|lien he)|quan noi", f)
        if conf and refs:
            extra["venue_confirmation"] = refs[0]
        return Understanding("SET_ALLERGY", {**patch}, refs, 0.95, extra=extra)
    if sp.avoid and not pending:
        return Understanding("SET_AVOID", patch, refs, 0.9, extra={"safety": sp})

    # --- pending answers
    if pending:
        ans = _answer(text, f, refs, patch, pending, state)
        if ans:
            return ans

    ack = re.fullmatch(r"(?:ok|oke|okay|o ke|u|um|uhm|uh|vang|da|duoc|duoc do|duoc roi|dong y|co|ung|dung|dung roi|chuan|chot|ok luon|ok nhe|ok ban)", f)
    no = (re.match(r"(?:khong|ko|chua|thoi|dung|that khong)\b", f) and len(words) <= 5
          and not re.search(r"khong (?:an|thich|muon|qua)|\d", f))

    # --- action verbs
    has_plan = re.search(r"\b(?:tao|lap|xep|len)\s+(?:lai\s+)?(?:lich|tour|lich trinh|hanh trinh|ke hoach)\b|\blap tour\b|\btao tour\b", f)
    if has_plan:
        if pending and pending.kind == "confirm_plan":
            return Understanding("CONFIRM_YES", patch, refs, 0.9)
        return Understanding("REQUEST_PLAN", patch, refs, 0.9)
    if ack:
        return Understanding("AMBIGUOUS_ACK" if not pending or pending.kind != "confirm_plan" else "CONFIRM_YES", confidence=0.9)
    if no and pending:
        return Understanding("CONFIRM_NO", confidence=0.85)
    crit = criteria_from(f)
    if re.search(r"so sanh", f) or (len(refs) >= 2 and re.search(r"hon\b|hay\b|nao", f)) or \
            re.search(r"(?<!co )\bquan nao\b.*\b(?:gan|re|mat|tot|ngon|nhanh|yen|dong|it|nhieu)\b", f):
        only_unsup = crit and all(c in tools.UNSUPPORTED for c in crit)
        if only_unsup and not refs and not state.last_results and "so sanh" not in f:
            return Understanding("SEARCH_VENUES", {**patch, "unsupported": crit}, refs, 0.8)
        return Understanding("COMPARE", {**patch, "criteria": crit}, refs, 0.9)
    if re.search(r"\b(?:bo|xoa|loai)\b", f) and not re.search(r"\bbo qua\b", f) and (refs or "danh sach" in f or "quan nay" in f):
        return Understanding("REMOVE", patch, refs, 0.9)
    if re.search(r"\bkhong lay\b", f) and ("nua" in f):
        return Understanding("REMOVE", patch, refs, 0.8)
    if re.search(r"\bgiu\b|nhat dinh phai co|luon giu|phai co trong tour", f):
        return Understanding("KEEP", patch, refs, 0.9)
    if re.search(r"\b(?:doi|thay)\b", f) and (refs or "tour" in f) and not re.search(r"\bthay\b.*\b(?:bun|pho)\b", f):
        return Understanding("MODIFY_PLAN", patch, refs, 0.8)
    if re.search(r"\bbot\b.*\bdiem dung\b|\bbot mot diem\b", f):
        return Understanding("MODIFY_PLAN", patch, refs, 0.8)
    dish = dish_in(f)
    if dish:
        patch["dish"] = dish
    if re.search(r"\bthay\b", f) and dish and not refs:
        dishes = [d[1].lower() for d in knowledge.DISHES if any((" " + q + " ") in (" " + f + " ") for q in d[5])]
        return Understanding("UPDATE_PROFILE", {**patch, "dish_replace": dishes}, refs, 0.8)
    if re.search(r"\bdung\b\s+(?:cho\s+)?(?:quan\s+)?", f) and dish and not refs:
        return Understanding("UPDATE_PROFILE", {**patch, "dislike": dish}, refs, 0.8)
    if re.search(r"\b(?:them|lay|chon|bo sung)\b", f) and \
            (refs or (dish and not re.search(r"tim (?:them|tiep)|xem them|cho xem them", f))
             or re.search(r"\b(?:them|lay|chon)\s+(?:mot\s+)?quan\b(?!\s+\w)", f)):
        extra = {"then_search": True} if refs and re.search(r"\btim\b", f) else {}
        return Understanding("ADD", patch, refs, 0.9, extra=extra)
    asks = re.search(r"mo cua|gio mo|may gio|\bgia\b|dia chi|co cho dau|chi tiet|menu|thuc don|ban gi|co ban\b|an toan cho|bao nhieu", f)
    if asks and (refs or "quan nay" in f):
        field_ = ("hours" if re.search(r"mo cua|gio mo|may gio", f) else "price" if re.search(r"\bgia\b|bao nhieu", f) else
                  "address" if "dia chi" in f else "parking_car" if re.search(r"o to|oto|cho dau", f) else
                  "allergy_safety" if "an toan" in f else "menu" if re.search(r"menu|thuc don|ban gi|it duong|co ban\b", f) else "detail")
        return Understanding("ASK_DETAIL", {**patch, "field": field_}, refs, 0.85)
    if re.search(r"^(?:xin chao|chao|hello|hi|hey|alo)\b|\bcam on\b|\btam biet\b|\bthanks\b|\bthank you\b", f):
        return Understanding("GREET_OR_SMALLTALK", confidence=0.9)

    # --- discover vs search vs profile
    discover = re.search(r"\ban gi\b|\bmon gi\b|\bmon nao\b|goi y mon|nen an|dang thu|\bla gi\b|co mon nao|\bdoi qua\b|an vat gi|"
                         r"mon (?:mat|am|nhe)|an sang|an trua|an toi|muon an gi|an gi do|di an dau|an dau\b", f)
    mood = ("cool" if re.search(r"\bnong\b|\bmat\b", f) else "warm" if re.search(r"\blanh\b|\bam\b", f) else
            "light" if re.search(r"nhe nhe|\bnhe\b", f) else None)
    if mood:
        patch["mood"] = mood
    meal = ("breakfast" if re.search(r"\bsang\b", f) else "lunch" if re.search(r"\btrua\b", f) else
            "dinner" if re.search(r"\btoi\b", f) else None)
    if meal:
        patch["meal"] = meal
    search_strong = re.search(r"\btim\b|\bkiem\b|\bquan\b|goi y quan|\bco quan\b|\bchi\b.*\bnao\b|cho an|chu nao|"
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
        return Understanding("UPDATE_PROFILE", {**patch, "dislike": f.split("khong thich", 1)[1].strip()[:40]}, refs, 0.7)
    if re.search(r"lam lai tu dau|bat dau lai|reset", f):
        return Understanding("UPDATE_PROFILE", {"reset": True}, refs, 0.9)
    if dish:
        return Understanding("SEARCH_VENUES", patch, refs, 0.6)
    if discover:
        return Understanding("DISCOVER_DISH", patch, refs, 0.7)
    if re.search(r"\bdoi\b|\bdoi qua\b|\bdoi bung\b|\bdoi lam\b", f) or "an gi" in f:
        return Understanding("DISCOVER_DISH", patch, refs, 0.6)
    return Understanding("UNKNOWN", patch, refs, 0.2)


def _answer(text, f, refs, patch, pending, state) -> Optional[Understanding]:
    """Bind a reply to the open question; returns None when it is not an answer."""
    if pending.kind == "confirm_plan":
        if re.fullmatch(r"(?:co|ok|oke|okay|dung|dung roi|xac nhan|dong y|chot|duoc|u|um|vang|da|tao di|ok tao di|u tao di|tao luon)", f) \
                or re.search(r"\b(?:xac nhan|tao di|chot)\b", f):
            return Understanding("CONFIRM_YES", confidence=0.95)
        if re.match(r"(?:khong|chua|thoi|de minh|cho minh sua|sua)\b", f) and len(f.split()) <= 5 and not re.search(r"\d|qua|muon", f):
            return Understanding("CONFIRM_NO", confidence=0.9)
        return None  # edits to the profile keep the confirmation open
    if pending.kind == "clarify_slot":
        slots = {k: v for k, v in patch.items() if not k.startswith("_")}
        if pending.slot == "budget_scope":
            if re.search(r"ca nhom|tong|ca ban|chung", f):
                slots["budget_scope"] = "group"
            elif re.search(r"moi nguoi|mot nguoi|dau nguoi", f):
                slots["budget_scope"] = "per_person"
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
