"""Preference extraction boundary. The LLM (or this mock) only extracts; the planner validates.

`MockExtractor` is a deterministic Vietnamese rule parser. It is NOT a live LLM and reports
`source="mock"`. With no provider configured callers should use `UnavailableExtractor`,
which returns `status="unavailable"` instead of faking success.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import Optional, Protocol

from app.planner.engine import missing_slots
from app.planner.relevance import fold
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
    source: str  # mock | live | none
    preferences: Preferences
    updated_fields: tuple = ()
    missing_slots: tuple = ()
    questions: tuple = ()
    notes: tuple = ()
    rejected_fields: tuple = ()  # values seen but out of range; never silently clamped


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


def _money(t: str) -> Optional[int]:
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(triệu|tr\b|nghìn|ngàn|k\b)", t)
    if m:
        n = float(m.group(1).replace(",", "."))
        return int(n * (1_000_000 if m.group(2) in ("triệu", "tr") else 1000))
    m = re.search(r"(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(đ|đồng|vnd|vnđ)", t)
    if m:
        return int(re.sub(r"[.,]", "", m.group(1)))
    return None


class MockExtractor:
    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        p = prior or Preferences()
        cleaned, dropped = _clean(text[:MAX_TEXT])
        t = " ".join(cleaned.casefold().split())
        upd, notes = {}, []
        if dropped:
            notes.append("Đã bỏ qua phần văn bản giống chỉ thị; chỉ trích xuất sở thích hợp lệ.")

        budget = _money(t)
        if budget and 0 < budget <= 100_000_000:
            upd["budget_vnd"] = budget
            if re.search(r"mỗi người|/\s*người|một người|người", t) and not re.search(r"cả nhóm|tổng|cả hội", t):
                upd["budget_scope"] = "per_person"
            elif re.search(r"cả nhóm|tổng|cả hội", t):
                upd["budget_scope"] = "group"
        dur = re.search(r"(\d+(?:[.,]\d+)?)\s*(giờ|tiếng)(?!\s*\d)", t)
        mins = re.search(r"(\d+)\s*phút", t)
        if dur and not re.search(r"(lúc|vào|từ|bắt đầu)\s*" + re.escape(dur.group(0)), t):
            upd["duration_min"] = int(float(dur.group(1).replace(",", ".")) * 60)
        elif mins:
            upd["duration_min"] = int(mins.group(1))
        rejected = []
        if "duration_min" in upd and not 30 <= upd["duration_min"] <= 720:
            rejected.append("duration_min")
            notes.append("Thời lượng ngoài khoảng 30–720 phút nên không được áp dụng; vui lòng nhập lại.")
            del upd["duration_min"]
        st = re.search(r"(?:lúc|vào|từ|bắt đầu)\s*(\d{1,2})(?::|\s*giờ\s*|h)(\d{2})?", t)
        if st:
            hh, mm = int(st.group(1)), int(st.group(2) or 0)
            if hh < 24 and mm < 60:
                upd["start_time_min"] = hh * 60 + mm
            else:
                rejected.append("start_time_min")
                notes.append("Giờ bắt đầu không hợp lệ nên không được áp dụng.")
        stops = re.search(r"(\d)\s*(quán|điểm|chỗ)", t)
        if stops:
            if 1 <= int(stops.group(1)) <= 5:
                upd["max_stops"] = int(stops.group(1))
            else:
                rejected.append("max_stops")
                notes.append("Số điểm dừng phải từ 1 đến 5; không được áp dụng.")
        party = re.search(r"(?:nhóm|đi|cho)\s*(\d+)\s*người", t)
        if party and 1 <= int(party.group(1)) <= 20:
            upd["party_size"] = int(party.group(1))
        for name, ll in ANCHORS.items():
            if name in t:
                upd["origin"] = ll
                notes.append(f"Điểm xuất phát lấy theo mốc gần đúng '{name}'.")
                break
        if re.search(r"chắc chắn|nghiêm ngặt|đã xác minh", t):
            upd["mode"] = "strict"
        elif re.search(r"khám phá|tham khảo", t):
            upd["mode"] = "explore"

        # Diacritic-insensitive, whole-word matching ("an bun" works; "oc" does not hit "hoc").
        ft = fold(t)
        excl = list(p.exclusions)
        for d in DISH_TERMS:
            fd = re.escape(fold(d))
            if re.search(r"\b(khong|tranh|tru|bo)\s+(?:an\s+|muon\s+)?" + fd + r"\b", ft) and d not in excl:
                excl.append(d)
        want = list(p.interests)
        for d in DISH_TERMS:
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
