"""Checked explanations: text is generated from validated Tour fields only, never free LLM claims."""
from __future__ import annotations

from app.planner.types import Tour, Venue

LABEL = {
    "verified_feasible": "Lịch trình đã đủ bằng chứng.",
    "conditional": "Gợi ý có điều kiện: một số thông tin chưa được xác minh.",
    "insufficient_evidence": "Chưa đủ bằng chứng để lập lịch trình đáng tin cậy.",
    "no_solution": "Không tìm được lịch trình thoả các ràng buộc.",
}
UNKNOWN_LABEL = {
    "hours": "giờ mở cửa theo ngày", "price_per_person": "giá theo người", "route": "dữ liệu định tuyến đi bộ từ nhà cung cấp",
    "party_size": "số người", "origin": "điểm xuất phát", "duration_min": "thời lượng", "budget_scope": "phạm vi ngân sách",
}


def explain(tour: Tour, venues: list) -> str:
    by_id = {v.id: v for v in venues}
    parts = [LABEL[tour.status]]
    if tour.stops:
        names = [by_id[s.venue_id].name for s in tour.stops if s.venue_id in by_id]
        parts.append("Các điểm dừng: " + " → ".join(names) + ".")
        if tour.walk_minutes is not None:
            kind = "ước tính đường chim bay" if tour.leg_source == "straight_line_estimate" else "theo tuyến"
            parts.append(f"Tổng đi bộ khoảng {tour.walk_minutes} phút ({kind}).")
        parts.append("Tổng khoảng giá tối đa của quán: {:,} ₫ (không phải hoá đơn mỗi người).".format(
            tour.venue_range_upper_sum_vnd).replace(",", "."))
    if tour.unknowns:
        parts.append("Chưa biết: " + ", ".join(UNKNOWN_LABEL.get(u, u) for u in tour.unknowns) + ".")
    parts.extend(tour.reasons if not tour.stops else ())
    if tour.proposed_changes:
        parts.append("Đề xuất: " + " ".join(tour.proposed_changes))
    return " ".join(parts)


# ---------------------------------------------------------------------------
# LLM-worded explanations (phase 3). The model only rewords FACTS derived from a validated
# Tour; its text is checked and replaced by the template above whenever a check fails.
# ---------------------------------------------------------------------------
import re as _re
import unicodedata as _ud
from collections import OrderedDict as _OrderedDict
from threading import Lock as _Lock

MAX_EXPLANATION_CHARS = 700
_NUM = _re.compile(r"\d+(?:[.,]\d+)*")
_ROUTE_LABEL = {"provider_route": "tuyến đi bộ từ nhà cung cấp định tuyến",
                "straight_line_estimate": "ước tính theo đường chim bay",
                "unknown": "chưa rõ"}


def _fold(text: str) -> str:
    text = _ud.normalize("NFD", text.casefold().replace("đ", "d"))
    return "".join(ch for ch in text if _ud.category(ch) != "Mn")


def tour_facts(tour: Tour, venues: list) -> dict:
    """Facts the model may restate. Nothing here is inferred.

    Privacy: no venue name, address, URL or id is included - the venue dataset is private local
    input and must not be sent to an external LLM. Stops are referred to as "Điểm dừng N"; the UI
    shows the real names next to the text.
    """
    by_id = {v.id: v for v in venues}
    stops = []
    for s in tour.stops:
        v = by_id.get(s.venue_id)
        if v is None:
            continue
        per_person = v.price_evidence == "verified"
        stops.append({
            "thu_tu": s.order, "ten": f"Điểm dừng {s.order}",
            "di_bo_phut": s.leg_from_previous.minutes, "km": s.leg_from_previous.km,
            "nguon_tuyen": _ROUTE_LABEL[s.leg_from_previous.source],
            "gia_min": v.price_min_vnd, "gia_max": v.price_max_vnd,
            "loai_gia": ("giá theo người đã xác minh" if per_person
                         else "khoảng giá của quán (không phải hoá đơn mỗi người)"),
            "gio_mo_cua": ("đã xác minh, mở lúc đến" if s.hours_evidence == "verified" and s.open_at_arrival
                           else "chưa rõ giờ mở cửa"),
        })
    return {
        "trang_thai": LABEL[tour.status], "so_diem_dung": len(stops), "diem_dung": stops,
        "tong_di_bo_phut": tour.walk_minutes,
        "chua_biet": [UNKNOWN_LABEL.get(u, u) for u in tour.unknowns],
        "ly_do": list(tour.reasons), "de_xuat": list(tour.proposed_changes),
    }


def _values(token: str) -> set:
    """Both readings of a number token: thousands-separated integer and decimal."""
    out = set()
    if _re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", token):
        out.add(float(token.replace(".", "").replace(",", "")))
    if token.count(",") + token.count(".") <= 1:
        out.add(round(float(token.replace(",", ".")), 2))
    return out


def _allowed_numbers(facts: dict) -> set:
    found = set()

    def walk(x):
        if isinstance(x, bool) or x is None:
            return
        if isinstance(x, (int, float)):
            found.add(round(float(x), 2))
            found.add(round(float(x), 1))
            if isinstance(x, int) and x >= 1000 and x % 1000 == 0:
                found.add(float(x // 1000))  # "45k"
        elif isinstance(x, str):
            for m in _NUM.findall(x):
                found.update(_values(m))
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, (list, tuple)):
            for v in x:
                walk(v)

    walk(facts)
    found.update(float(i) for i in range(0, len(facts.get("diem_dung", [])) + 1))
    return found


def check_explanation(text, facts: dict) -> list:
    """Return problems; empty means the text may be shown."""
    if not isinstance(text, str) or not text.strip():
        return ["empty"]
    problems = []
    if len(text) > MAX_EXPLANATION_CHARS:
        problems.append("too_long")
    if _re.search(r"https?://|www\.|[<>{}\x00-\x08\x0b-\x1f]", text):
        problems.append("url_or_markup")
    f = _fold(text)
    stops = facts.get("diem_dung", [])
    hours_ok = bool(stops) and all(s["gio_mo_cua"].startswith("đã xác minh") for s in stops)
    per_person_ok = bool(stops) and all(s["loai_gia"].startswith("giá theo người") for s in stops)
    routes_ok = bool(stops) and all(s["nguon_tuyen"].startswith("tuyến đi bộ") for s in stops)
    verified = facts.get("trang_thai") == LABEL["verified_feasible"]
    # (pattern, allowed by facts, name, negation may excuse it). Opening, per-person and guarantee
    # claims are never excused by nearby negation: wording like "đang mở cửa và không xa" must fail.
    rules = [
        (r"dang mo|chac chan mo|luon mo|mo cua (luc|tu|den|ca)|van mo", hours_ok, "opening_claim", False),
        (r"(gia|chi phi|tien) (moi|cho moi|tren moi|1|mot) nguoi|moi nguoi (chi|het|tra)", per_person_ok,
         "per_person_claim", False),
        (r"tuyen (duong|di) thuc|duong di thuc|theo duong that|tuyen di bo thuc", routes_ok, "route_claim", True),
        (r"(da|duoc) xac minh|da kiem chung", verified, "verified_claim", True),
        (r"(?<!khong )(?<!khong the )(dam bao|cam ket|chac chan|tuyet doi)|an toan|di ung|khong chua|100 ?%",
         False, "guarantee_claim", False),
    ]
    for pattern, ok, name, negatable in rules:
        if ok:
            continue
        for m in _re.finditer(pattern, f):
            before = f[max(0, m.start() - 12):m.start()]
            after = " ".join(f[m.end():].split()[:3])
            if negatable and (_re.search(r"\b(chua|khong)\b", before) or _re.search(r"\b(chua|khong)\b", after)):
                continue
            problems.append(name)
            break
    # Spelled-out compound numbers would bypass the numeric check below.
    if _re.search(r"\b(muoi|tram|nghin|trieu)\b|\b(mot|hai|ba|bon|nam|sau|bay|tam|chin) ngan\b", f):
        problems.append("spelled_number")
    if facts.get("chua_biet") and not _re.search(r"chua|uoc tinh|tham khao|co dieu kien", f):
        problems.append("missing_uncertainty")
    allowed = _allowed_numbers(facts)
    for token in _NUM.findall(text):
        if not any(any(abs(v - a) < 0.051 for a in allowed) for v in _values(token)):
            problems.append("unsupported_number")
            break
    return problems


class CheckedExplainer:
    """explain(tour, venues) -> (text, source). source is 'llm' only when every check passed."""

    def __init__(self, provider=None, *, deadline_s: float = 15.0, cache_size: int = 256, attempts: int = 2):
        self.provider, self.deadline_s, self.attempts = provider, deadline_s, max(1, attempts)
        self._cache, self._lock, self.cache_size = _OrderedDict(), _Lock(), cache_size
        self.last_problems: list = []
        self.stats = {"llm": 0, "fallback": 0}

    def explain(self, tour: Tour, venues: list) -> tuple:
        template = explain(tour, venues)
        if self.provider is None or not tour.stops:
            return template, "template"
        facts = tour_facts(tour, venues)
        key = repr(facts)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
        text, problems = None, ["provider_error"]
        for _ in range(self.attempts):  # model output varies between calls; each attempt is fully re-checked
            try:
                text = self.provider.explain(facts, deadline_s=self.deadline_s)
                problems = check_explanation(text, facts)
            except Exception:
                text, problems = None, ["provider_error"]
                break  # do not hammer an unavailable/over-quota provider
            if not problems:
                break
        self.last_problems = problems
        result = (text.strip(), "llm") if not problems else (template, "template")
        with self._lock:
            self.stats["llm" if not problems else "fallback"] += 1
            self._cache[key] = result
            while len(self._cache) > self.cache_size:
                self._cache.popitem(last=False)
        return result
