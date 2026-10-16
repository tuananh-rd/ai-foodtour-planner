"""Preference extraction boundary. The LLM (or this mock) only extracts; the planner validates.

`MockExtractor` is a deterministic Vietnamese rule parser. It is NOT a live LLM and reports
`source="mock"`. With no provider configured callers should use `UnavailableExtractor`,
which returns `status="unavailable"` instead of faking success.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, replace
from typing import Optional, Protocol

from app.planner import allergens
from app.planner.engine import missing_slots
from app.planner.relevance import fold, fold_uncached
from app.planner.types import Preferences

MAX_TEXT = 1000
DISH_TERMS = ("bún", "phở", "bánh mì", "bánh cuốn", "chè", "nem", "xôi", "cà phê", "lẩu", "ốc", "chả", "kem",
              "cơm", "cháo", "miến", "mì", "hải sản", "trà sữa", "ăn vặt", "bánh tằm", "bánh ướt", "đồ ngọt")
# Public landmark anchors (not venue data). Approximate; the UI should let the user correct them.
ANCHORS = {
    "hồ gươm": (21.0285, 105.8522), "hồ hoàn kiếm": (21.0285, 105.8522),
    "phố cổ": (21.0340, 105.8510), "nhà thờ lớn": (21.0287, 105.8490),
}
QUESTIONS = {
    "origin": "Bạn muốn xuất phát từ đâu (ví dụ: Hồ Gươm, Phố cổ)?",
    "duration_min": "Bạn có khoảng bao nhiêu giờ cho chuyến đi?",
    "budget_scope": "Ngân sách này là cho mỗi người hay cả nhóm?",
}


@dataclass(frozen=True)
class ExtractionResult:
    status: str  # ok | unavailable
    source: str  # mock (rules) | live (LLM answered) | cache (earlier LLM answer) | none
    preferences: Preferences
    updated_fields: tuple = ()
    missing_slots: tuple = ()
    questions: tuple = ()
    notes: tuple = ()
    rejected_fields: tuple = ()  # values seen but out of range; never silently clamped
    # Free-text place the user wants to start from that is NOT one of the built-in landmarks.
    # The API layer resolves it with the server-side geocoder (Google) or asks the user; the
    # extractor never invents coordinates for it.
    origin_text: Optional[str] = None
    # Provider (LLM) calls consumed by producing THIS result: 0 for rules/cache, 1 when the model
    # was invoked (even if it then failed). A purely local refusal (no budget left) is not a call.
    llm_calls: int = 0


class PreferenceExtractor(Protocol):
    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult: ...


class UnavailableExtractor:
    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        p = prior or Preferences()
        return ExtractionResult("unavailable", "none", p, notes=("Chưa cấu hình nhà cung cấp LLM.",))


# Instruction-like text is data about the user's request, never a source of slots.
INJECTION = re.compile(
    r"bỏ qua|bo qua|ignore|disregard|system\s*:|assistant\s*:|developer\s*:|prompt|reveal|api[ _-]?key|"
    r"\bmode\s*=|verified_feasible|jailbreak|quy tắc|instructions?", re.I)


def _clean(text: str) -> tuple:
    parts = re.split(r"(?<=[.!?;])\s+|\n+", text)
    kept = [x for x in parts if not INJECTION.search(x)]
    return " ".join(kept), len(kept) != len(parts)


def _strip_marks(text: str) -> str:
    text = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def _money(u: str) -> Optional[int]:
    """u is diacritic-stripped, lower-cased text. Negative amounts return -1 so callers reject them."""
    m = re.search(r"(-?)(\d+(?:[.,]\d+)?)\s*(trieu|tr\b|nghin|ngan|k\b)", u)
    if m:
        if m.group(1):
            return -1
        n = float(m.group(2).replace(",", "."))
        return int(n * (1_000_000 if m.group(3) in ("trieu", "tr") else 1000))
    m = re.search(r"(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(d\b|dong|vnd)", u)
    if m:
        return int(re.sub(r"[.,]", "", m.group(1)))
    return None


_ALLERGY_TRIGGER = re.compile(
    r"(?:bị\s+|bi\s+)?(?:dị ứng|di ung|kiêng|kieng|không ăn được|khong an duoc|không thể ăn|khong the an)"
    r"(?:\s+(?:với|voi))?\s+([^.;!?\n]+)")
_AVOID_TRIGGER = re.compile(r"\b(?:không|khong|ko)\s+(?:ăn|an)\s+(?:được\s+|duoc\s+)?([^.;!?,\n]+)")
_TERM_SPLIT = re.compile(r",|\bvà\b|\bva\b|\bhoặc\b|\bhoac\b|\bvới\b|\bvoi\b|\bnhưng\b|\bnhung\b|\bcòn\b|\bcon\b")
_FILLER = re.compile(r"^(?:các|cac|món|mon|đồ|do|những|nhung|loại|loai|thịt|thit)\s+")
_TRAILING = re.compile(r"\s+(?:nữa|nua|nhé|nhe|nha|thôi|thoi|ạ|a|đấy|day|luôn|luon|rồi|roi|xong|đó|do)$")
_NOT_A_TERM = re.compile(r"\d|người|nguoi|nhóm|nhom|\bk\b|đồng|dong|ngân|ngan|tiền|tien")


_NEGATOR = re.compile(r"(?:không|khong|chẳng|chang|chưa|chua|ko|hết|het)\s*(?:còn|con|bị|bi|có|co)?\s*$")
_REMOVER = re.compile(r"(?:hết|het|không còn|khong con|chẳng còn|chang con)\s*(?:bị |bi )?$")
_TAGS = re.compile(r"<[^>]*>")
_STOP_AT = re.compile(r"\s+(?=\d|(?:người|nguoi|nhóm|nhom|ngân|ngan|mỗi|moi|cả|ca nhom|khoảng|khoang|lúc|luc|trong|quanh|"
                      r"tại|tai|muốn|muon|đi|di|ăn|an)\b)")


def _allergy_terms(chunk: str) -> list:
    out = []
    chunk = _STOP_AT.split(_TAGS.sub(" ", chunk), maxsplit=1)[0]  # "cua 4 người" -> "cua"
    for raw in _TERM_SPLIT.split(chunk):
        raw = re.sub(r"[^\w\s-]", "", raw)  # no markup/punctuation ever reaches user-visible notes
        term = _TRAILING.sub("", _FILLER.sub("", raw.strip(" \t-:")).strip()).strip()
        if not term or _NOT_A_TERM.search(term) or term in ("gì", "gi", "gì cả", "gi ca"):
            continue
        term = " ".join(term.split()[:3])[:allergens.MAX_TERM_CHARS].strip()
        if term and term not in out:
            out.append(term)
    return out


class MockExtractor:
    def _allergies(self, t, u, prior, upd, notes):
        """Allergy / avoidance statements must never be dropped silently (C0-HF)."""
        found, cleared = [], []
        for m in _ALLERGY_TRIGGER.finditer(t):
            before = t[max(0, m.start() - 16):m.start()]
            terms = _allergy_terms(m.group(1))
            if _REMOVER.search(before):
                cleared += terms  # "hết dị ứng cua rồi": user retracts it
            elif _NEGATOR.search(before):
                continue  # "không dị ứng …" states the absence of an allergy; nothing to record
            else:
                found += terms
        if cleared:
            keep = [a for a in prior.allergies
                    if all(allergens.fold_uncached(a) != allergens.fold_uncached(c) for c in cleared)]
            if len(keep) != len(prior.allergies):
                upd["allergies"] = tuple(keep)
                notes.append("Đã bỏ khỏi danh sách dị ứng: " + ", ".join(cleared) + ". Bạn có thể thêm lại bất cứ lúc nào.")
        if found:
            merged = list(upd.get("allergies", prior.allergies))
            for term in found:
                if all(allergens.fold_uncached(term) != allergens.fold_uncached(x) for x in merged):
                    merged.append(term)
            upd["allergies"] = tuple(merged[:allergens.MAX_TERMS])
            odd = allergens.unrecognised(tuple(found))
            notes.append("Đã ghi nhận dị ứng/kiêng: " + ", ".join(found) + ". Dữ liệu quán không có thông tin nguyên liệu "
                         "nên mình chỉ loại các quán có tên/nhóm món liên quan; không quán nào được xác nhận an toàn "
                         "— hãy hỏi quán trước khi ăn.")
            if odd:
                notes.append("Chưa có quy tắc cho: " + ", ".join(odd) + "; mình chỉ loại quán có tên/món chứa đúng từ này.")
            return []
        avoid = []
        for m in _AVOID_TRIGGER.finditer(u):
            terms = [x for x in _allergy_terms(m.group(1)) if allergens.recognised(x)]
            if not terms:
                continue
            avoid += [x for x in terms if x not in avoid]
            notes.append("Đã ghi nhận không ăn: " + ", ".join(terms) + ". Đây là dị ứng hay chỉ là không thích? "
                         "Nếu là dị ứng, hãy nói 'dị ứng " + terms[0] + "' để mình lưu ý an toàn.")
        return avoid

    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        p = prior or Preferences()
        cleaned, dropped = _clean(text[:MAX_TEXT])
        t = " ".join(cleaned.casefold().split())
        upd, notes = {}, []
        if dropped:
            notes.append("Đã bỏ qua phần văn bản giống chỉ thị; chỉ trích xuất sở thích hợp lệ.")

        # Slot parsing runs on diacritic-stripped text (users often type without accents).
        u = _strip_marks(t)
        rejected = []

        budget = _money(u)
        if budget is not None and not 0 < budget <= 100_000_000:
            rejected.append("budget_vnd")
            notes.append("Ngân sách phải lớn hơn 0 và không quá 100 triệu đồng; không được áp dụng.")
            budget = None
        if budget:
            upd["budget_vnd"] = budget
            if re.search(r"ca nhom|tong|ca hoi|ca ban|chung", u):
                upd["budget_scope"] = "group"
            elif re.search(r"moi nguoi|/\s*nguoi|mot nguoi|dau nguoi|per person", u):
                upd["budget_scope"] = "per_person"
        # Start time first, then remove it so "8 gio 30" is not read as a duration.
        st = re.search(r"(?:luc|vao|tu|bat dau|xuat phat)\s*(\d{1,2})(?::|\s*gio\s*|h)(\d{2})?", u)
        u_dur = u
        if st:
            hh, mm = int(st.group(1)), int(st.group(2) or 0)
            u_dur = u[:st.start()] + " " + u[st.end():]
            if hh < 24 and mm < 60:
                upd["start_time_min"] = hh * 60 + mm
            else:
                rejected.append("start_time_min")
                notes.append("Giờ bắt đầu không hợp lệ nên không được áp dụng.")
        dur = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:gio|tieng)(?:\s*(\d{1,2})\s*(?:phut|p)\b)?", u_dur)
        mins = re.search(r"(\d+)\s*phut", u_dur)
        if dur:
            upd["duration_min"] = int(float(dur.group(1).replace(",", ".")) * 60) + int(dur.group(2) or 0)
        elif mins:
            upd["duration_min"] = int(mins.group(1))
        if "duration_min" in upd and not 30 <= upd["duration_min"] <= 720:
            rejected.append("duration_min")
            notes.append("Thời lượng ngoài khoảng 30–720 phút nên không được áp dụng; vui lòng nhập lại.")
            del upd["duration_min"]
        stops = re.search(r"\b(\d+)\s*(?:quan|diem|cho)\b", u)
        if stops:
            if 1 <= int(stops.group(1)) <= 5:
                upd["max_stops"] = int(stops.group(1))
            else:
                rejected.append("max_stops")
                notes.append("Số điểm dừng phải từ 1 đến 5; không được áp dụng.")
        party = (re.search(r"(?:nhom|di|cho|ban|gia dinh)\s*(\d+)\s*nguoi", u)
                 or re.search(r"(?:doi thanh|doi sang|chinh thanh|chinh lai|con lai|con|co|la|gom|toi|minh|tui)\s*(\d+)\s*nguoi\b", u)
                 or re.search(r"(?<![\d/.,])\b(\d{1,3})\s*nguoi\b", u))
        party_n = int(party.group(1)) if party else None
        if party_n is None:
            word = re.search(r"(?:doi thanh|doi sang|chinh thanh|nhom|di|cho|gom|con|la)\s*(hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*nguoi\b", u)
            if word:
                party_n = {"hai": 2, "ba": 3, "bon": 4, "nam": 5, "sau": 6, "bay": 7, "tam": 8, "chin": 9, "muoi": 10}[word.group(1)]
        if party_n is not None:
            if 1 <= party_n <= 20:
                upd["party_size"] = party_n
            else:
                rejected.append("party_size")
                notes.append("Số người phải từ 1 đến 20; không được áp dụng.")
        avoid_terms = self._allergies(t, u, p, upd, notes)
        for name, ll in ANCHORS.items():
            if _strip_marks(name) in u:
                upd["origin"] = ll
                upd["origin_label"] = name.title()
                upd["origin_source"] = "landmark"
                notes.append(f"Điểm xuất phát lấy theo mốc gần đúng '{name}'.")
                break
        # Soft-ranking hints only (contract v1.6); the planner never treats them as constraints.
        for meal, pattern in (("late", r"\b(khuya|dem khuya|an dem)\b"), ("breakfast", r"\b(an sang|bua sang|buoi sang)\b"),
                              ("lunch", r"\b(an trua|bua trua|buoi trua)\b"), ("snack", r"\b(buoi xe|bua xe|an chieu)\b"),
                              ("dinner", r"\b(an toi|bua toi|buoi toi)\b")):
            if re.search(pattern, u):
                upd["meal"] = meal
                break
        else:
            # A bare time-of-day ("toi nay") is a meal hint only together with an eating verb.
            if re.search(r"\b(an|uong)\b", u):
                if re.search(r"\bchieu nay\b", u):
                    upd["meal"] = "snack"
                elif re.search(r"\btoi nay\b", u):
                    upd["meal"] = "dinner"
        # Negated audience terms ("khong co tre em") are removed before matching.
        ua = re.sub(r"\b(khong|chang|chu|dung)\s+(?:co |di voi |dan |phai )?(?:gia dinh|tre em|con nho|bo me|ong ba|"
                    r"ban be|nhom ban|dong nghiep|hop nhom)\b", " ", u)
        for audience, pattern in (("solo", r"\b(mot minh|di mot minh|di le)\b"),
                                  ("family", r"\b(gia dinh|tre em|con nho|bo me|ong ba)\b"),
                                  ("friends", r"\b(ban be|nhom ban|dong nghiep|hop nhom)\b")):
            if re.search(pattern, ua):
                upd["audience"] = audience
                break
        if re.search(r"chac chan|nghiem ngat|da xac minh", u):
            upd["mode"] = "strict"
        elif re.search(r"kham pha|tham khao", u):
            upd["mode"] = "explore"

        # Diacritic-insensitive, whole-word matching ("an bun" works; "oc" does not hit "hoc").
        ft = fold_uncached(t)
        excl = list(p.exclusions)
        for x in avoid_terms:
            if x not in excl:
                excl.append(x)
        for d in DISH_TERMS:
            fd = re.escape(fold(d))
            if re.search(r"\b(khong|tranh|tru|bo)\s+(?:an\s+|muon\s+)?" + fd + r"\b", ft) and d not in excl:
                excl.append(d)
        want = list(p.interests)
        banned = {allergens.family_of(a) or fold_uncached(a) for a in (upd.get("allergies") or p.allergies)}
        for d in DISH_TERMS:
            if (allergens.family_of(d) or fold_uncached(d)) in banned:
                continue  # never turn an allergen into a wanted dish
            if re.search(r"\b" + re.escape(fold(d)) + r"\b", ft) and d not in excl and d not in want:
                want.append(d)
        if tuple(want) != p.interests:
            upd["interests"] = tuple(want[:10])
        if tuple(excl) != p.exclusions:
            upd["exclusions"] = tuple(excl[:10])

        merged = replace(p, **upd)  # unspecified slots keep their prior values
        miss = tuple(missing_slots(merged))
        return ExtractionResult("ok", "mock", merged, tuple(sorted(upd)), miss,
                                tuple(QUESTIONS[m] for m in miss if m in QUESTIONS), tuple(notes), tuple(rejected))
