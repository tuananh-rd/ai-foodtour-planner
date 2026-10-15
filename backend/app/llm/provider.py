"""Live-LLM extraction boundary (no network code here).

A provider is any object with `complete(text, prior, deadline_s) -> str` returning JSON text.
The model is untrusted: its output is parsed against a strict allowlist schema and every slot is
range-checked. Anything unknown or out of range is dropped and reported, never clamped or trusted.
With no provider configured use `UnavailableExtractor` (status "unavailable"); a provider error
also yields "unavailable" - never fabricated success.
"""
from __future__ import annotations

import json
import re
from dataclasses import replace
from typing import Optional, Protocol

from app.llm.extract import ExtractionResult, MAX_TEXT, QUESTIONS, _clean
from app.planner.engine import missing_slots
from app.planner.types import Preferences

MAX_RAW_BYTES = 8192
# Pilot-area sanity box for an origin the model proposes (Hanoi and surroundings).
BBOX = (20.5, 21.5, 105.4, 106.2)
HH_MM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class ProviderError(Exception):
    def __init__(self, kind: str, message: str = "", status: int | None = None):
        super().__init__(message or kind)
        self.kind = kind  # timeout | quota | unavailable | bad_response
        self.status = status  # HTTP status when the provider answered with an error (never a URL/body)


class ExtractionProvider(Protocol):
    def complete(self, text: str, prior: Optional[dict], *, deadline_s: float) -> str: ...


def _int(v, lo, hi):
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise ValueError
    return v


def _terms(v):
    if not isinstance(v, list) or len(v) > 10:
        raise ValueError
    out = []
    for x in v:
        if not isinstance(x, str) or not x.strip() or len(x) > 40 or CONTROL.search(x):
            raise ValueError
        out.append(x.strip())
    return tuple(out)


def _place_text(v):
    if not isinstance(v, str):
        raise ValueError
    v = v.strip()
    if not 2 <= len(v) <= 120 or CONTROL.search(v):
        raise ValueError
    return v


def _origin(v):
    if not isinstance(v, dict) or set(v) != {"lat", "lon"}:
        raise ValueError
    lat, lon = v["lat"], v["lon"]
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in (lat, lon)):
        raise ValueError
    if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]):
        raise ValueError
    return (float(lat), float(lon))


def _start(v):
    if not isinstance(v, str):
        raise ValueError
    m = HH_MM.match(v)
    if not m:
        raise ValueError
    return int(m.group(1)) * 60 + int(m.group(2))


def _enum(*allowed):
    def check(v):
        if v not in allowed:
            raise ValueError
        return v
    return check


# field -> (Preferences attribute, validator)
SCHEMA = {
    "origin": ("origin", _origin),
    "start_time": ("start_time_min", _start),
    "weekday": ("weekday", lambda v: _int(v, 0, 6)),
    "duration_min": ("duration_min", lambda v: _int(v, 30, 720)),
    "budget_vnd": ("budget_vnd", lambda v: _int(v, 1, 100_000_000)),
    "budget_scope": ("budget_scope", _enum("per_person", "group")),
    "party_size": ("party_size", lambda v: _int(v, 1, 20)),
    "interests": ("interests", _terms),
    "exclusions": ("exclusions", _terms),
    "max_stops": ("max_stops", lambda v: _int(v, 1, 5)),
    "mode": ("mode", _enum("explore", "strict")),
    # Not a Preferences field: carried on ExtractionResult.origin_text for server-side geocoding.
    "origin_text": ("origin_text", lambda v: _place_text(v)),
    "origin_label": ("origin_label", lambda v: _place_text(v)),
    "origin_source": ("origin_source", _enum("landmark")),
}


def parse_and_validate(raw: str) -> tuple:
    """Return (updates: dict of Preferences attrs, rejected: list of field names, error: str|None)."""
    if not isinstance(raw, str) or len(raw.encode("utf-8", "ignore")) > MAX_RAW_BYTES:
        return {}, [], "bad_response"
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        return {}, [], "bad_response"
    if not isinstance(data, dict):
        return {}, [], "bad_response"
    updates, rejected = {}, []
    for key, value in data.items():
        if key not in SCHEMA:
            rejected.append("unknown_field")  # model-controlled names are never reflected
            continue
        if value is None:
            continue  # explicit null = not specified
        attr, check = SCHEMA[key]
        try:
            updates[attr] = check(value)
        except (ValueError, TypeError):
            rejected.append(key)
    return updates, rejected, None


def _prior_json(p: Preferences) -> dict:
    return {
        "origin": {"lat": p.origin[0], "lon": p.origin[1]} if p.origin else None,
        "duration_min": p.duration_min, "budget_vnd": p.budget_vnd, "budget_scope": p.budget_scope,
        "party_size": p.party_size, "interests": list(p.interests), "exclusions": list(p.exclusions),
        "max_stops": p.max_stops, "mode": p.mode,
        "start_time": (f"{p.start_time_min // 60:02d}:{p.start_time_min % 60:02d}"
                       if p.start_time_min is not None else None),
        "weekday": p.weekday,
    }


class LLMExtractor:
    """Calls an ExtractionProvider and validates everything it returns."""

    def __init__(self, provider: ExtractionProvider, deadline_s: float = 8.0):
        self.provider, self.deadline_s = provider, deadline_s

    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        p = prior or Preferences()
        cleaned, dropped = _clean(text[:MAX_TEXT])
        notes = ["Đã bỏ qua phần văn bản giống chỉ thị."] if dropped else []
        try:
            raw = self.provider.complete(cleaned, _prior_json(p), deadline_s=self.deadline_s)
        except ProviderError as e:
            return ExtractionResult("unavailable", "none", p, notes=tuple(notes) + (f"Nhà cung cấp LLM lỗi: {e.kind}.",))
        except Exception:  # never leak provider internals or crash the request
            return ExtractionResult("unavailable", "none", p, notes=tuple(notes) + ("Nhà cung cấp LLM không khả dụng.",))
        updates, rejected, error = parse_and_validate(raw)
        if error:
            return ExtractionResult("unavailable", "none", p, notes=tuple(notes) + ("Phản hồi LLM không hợp lệ.",))
        if rejected:
            notes.append("Một số trường từ mô hình không hợp lệ nên bị bỏ qua: " + ", ".join(sorted(set(rejected))) + ".")
        origin_text = updates.pop("origin_text", None)
        if "origin" in updates and updates.get("origin_source") != "landmark":
            updates.pop("origin_label", None)  # a label without a server-resolved landmark is not trusted
        if "origin" not in updates:
            updates.pop("origin_label", None)
            updates.pop("origin_source", None)
        else:
            origin_text = None  # already resolved by a built-in landmark
        merged = replace(p, **updates)
        miss = tuple(missing_slots(merged))
        if origin_text and merged.origin is None:
            miss = tuple(miss)  # origin stays missing until the API geocodes origin_text or the user answers
        return ExtractionResult("ok", "live", merged, tuple(sorted(updates)), miss,
                                tuple(QUESTIONS[m] for m in miss if m in QUESTIONS), tuple(notes),
                                tuple(sorted(set(rejected))), origin_text)


class FallbackExtractor:
    """Use the LLM; if it is unavailable, use the rule-based extractor and SAY so (source='mock')."""

    def __init__(self, primary, fallback):
        self.primary, self.fallback = primary, fallback

    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        first = self.primary.extract(text, prior)
        if first.status == "ok":
            return first
        second = self.fallback.extract(text, prior)
        if second.status != "ok":
            return first
        note = "Mô hình ngôn ngữ chưa phản hồi được; đã dùng bộ luật trích xuất cục bộ."
        return replace(second, notes=tuple(second.notes) + (note,))
