"""Live-LLM extraction boundary (no network code here).

A provider is any object with `complete(text, prior, deadline_s) -> str` returning JSON text.
The model is untrusted: its output is parsed against a strict allowlist schema and every slot is
range-checked. Anything unknown or out of range is dropped and reported, never clamped or trusted.
With no provider configured use `UnavailableExtractor` (status "unavailable"); a provider error
also yields "unavailable" - never fabricated success.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from collections import OrderedDict
from dataclasses import replace
from threading import Lock
from typing import Optional, Protocol

import unicodedata

from app.llm.extract import ANCHORS, ExtractionResult, MAX_TEXT, QUESTIONS, _clean
from app.planner.relevance import fold
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
    # Same policy as the API schema: no C0/DEL and no Unicode Cc/Cf/Cs (e.g. zero-width characters).
    if (not 2 <= len(v) <= 120 or CONTROL.search(v)
            or any(unicodedata.category(ch) in ("Cc", "Cf", "Cs") for ch in v)):
        raise ValueError
    return v


def _grounded(phrase: str, user_text: str) -> bool:
    """True when the phrase appears as a contiguous word sequence in the (cleaned) user text."""
    want, have = fold(phrase).split(), fold(user_text).split()
    n = len(want)
    return n > 0 and any(have[i:i + n] == want for i in range(len(have) - n + 1))


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
    # origin_label/origin_source are NEVER accepted from a model; the server derives them.
}


def parse_and_validate(raw: str, user_text: str | None = None, allow_raw_origin: bool = True) -> tuple:
    """Return (updates: dict of Preferences attrs, rejected: list of field names, error: str|None).

    user_text (the cleaned current message) enables grounding: origin_text and origin_landmark are
    accepted only when they appear in it. allow_raw_origin=False refuses model-supplied coordinates.
    """
    if not isinstance(raw, str) or len(raw.encode("utf-8", "ignore")) > MAX_RAW_BYTES:
        return {}, [], "bad_response"
    try:
        data = json.loads(raw)
    except (ValueError, RecursionError):
        return {}, [], "bad_response"
    if not isinstance(data, dict):
        return {}, [], "bad_response"
    updates, rejected = {}, []
    landmark = data.pop("origin_landmark", None)
    if landmark is not None:
        key = landmark.strip().casefold() if isinstance(landmark, str) else None
        if key in ANCHORS and (user_text is None or _grounded(key, user_text)):
            updates["origin"] = ANCHORS[key]
            updates["origin_label"] = key.title()
            updates["origin_source"] = "landmark"
        else:
            rejected.append("origin_landmark")
    for key, value in data.items():
        if key not in SCHEMA:
            rejected.append("unknown_field")  # model-controlled names are never reflected
            continue
        if value is None:
            continue  # explicit null = not specified
        if key == "origin" and not allow_raw_origin:
            rejected.append("origin")  # coordinates must come from the server, never from a model
            continue
        attr, check = SCHEMA[key]
        try:
            updates[attr] = check(value)
        except (ValueError, TypeError):
            rejected.append(key)
            continue
        if key == "origin_text" and user_text is not None and not _grounded(updates[attr], user_text):
            updates.pop(attr)
            rejected.append("origin_text")  # not a phrase the user wrote
    if "origin" in updates and "origin_source" not in updates:
        # Raw coordinates (only possible with allow_raw_origin) carry no server-verified label.
        updates["origin_source"] = None
    return updates, rejected, None


def _prior_json(p: Preferences) -> dict:
    return {
        # Privacy: never send precise coordinates (possibly the user's current location) to the LLM.
        "origin_set": p.origin is not None,
        "origin_label": (p.origin_label if p.origin and p.origin_source in ("landmark", "place", "geocoded")
                         else None),
        "duration_min": p.duration_min, "budget_vnd": p.budget_vnd, "budget_scope": p.budget_scope,
        "party_size": p.party_size, "interests": list(p.interests), "exclusions": list(p.exclusions),
        "max_stops": p.max_stops, "mode": p.mode,
        "start_time": (f"{p.start_time_min // 60:02d}:{p.start_time_min % 60:02d}"
                       if p.start_time_min is not None else None),
        "weekday": p.weekday,
    }


class LLMExtractor:
    """Calls an ExtractionProvider and validates everything it returns."""

    def __init__(self, provider: ExtractionProvider, deadline_s: float = 8.0, allow_raw_origin: bool = False):
        self.provider, self.deadline_s = provider, deadline_s
        self.allow_raw_origin = allow_raw_origin  # only for trusted internal providers/tests

    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        p = prior or Preferences()
        cleaned, dropped = _clean(text[:MAX_TEXT])
        notes = ["Đã bỏ qua phần văn bản giống chỉ thị."] if dropped else []
        try:
            raw = self.provider.complete(cleaned, _prior_json(p), deadline_s=self.deadline_s)
        except ProviderError as e:
            # A local budget refusal never reached the provider; anything else counts as one call.
            attempted = getattr(e, "llm_calls", None)  # set by an adapter that already spent an attempt
            if attempted is not None:
                calls = 1 if attempted else 0
            else:
                calls = 0 if (e.kind == "quota" and e.status is None) else 1
            return ExtractionResult("unavailable", "none", p, notes=tuple(notes) + (f"Nhà cung cấp LLM lỗi: {e.kind}.",),
                                    llm_calls=calls)
        except Exception:  # never leak provider internals or crash the request
            return ExtractionResult("unavailable", "none", p, notes=tuple(notes) + ("Nhà cung cấp LLM không khả dụng.",),
                                    llm_calls=1)
        updates, rejected, error = parse_and_validate(raw, cleaned, self.allow_raw_origin)
        if error:
            return ExtractionResult("unavailable", "none", p, notes=tuple(notes) + ("Phản hồi LLM không hợp lệ.",),
                                    llm_calls=1)
        if rejected:
            notes.append("Một số trường từ mô hình không hợp lệ nên bị bỏ qua: " + ", ".join(sorted(set(rejected))) + ".")
        origin_text = updates.pop("origin_text", None)
        if "origin" not in updates:
            updates.pop("origin_label", None)
            updates.pop("origin_source", None)
        else:
            origin_text = None  # already resolved (built-in landmark or trusted coordinates)
            if updates.get("origin_source") is None:
                updates.pop("origin_source", None)
        merged = replace(p, **updates)
        miss = tuple(missing_slots(merged))
        if origin_text and merged.origin is None:
            miss = tuple(miss)  # origin stays missing until the API geocodes origin_text or the user answers
        return ExtractionResult("ok", "live", merged, tuple(sorted(updates)), miss,
                                tuple(QUESTIONS[m] for m in miss if m in QUESTIONS), tuple(notes),
                                tuple(sorted(set(rejected))), origin_text, 1)


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


# Words that suggest the user named a place the built-in landmarks do not cover.
_PLACE_CUES = ("quanh", "gan", "o ", "tai", "tu ", "xuat phat", "ngo ", "pho ", "cho ", "duong ", "khu ")


class RulesFirstExtractor:
    """Answer with the local rule extractor; call the LLM only when the rules cannot finish the job.

    The free LLM tier is scarce (see docs/UPGRADE_PLAN.md 5.3). Order of preference:
      1. rules (0 calls) when both required slots (origin, duration) are known after merging,
         or when the rules failed only because a value was rejected as out of range (the model
         cannot repair a deterministic range problem);
      2. cache of an earlier model answer for the same message+prior (0 calls);
      3. the model (1 call), whose answer is cached; if it fails the rule result is returned and the
         response says so.
    """

    def __init__(self, rules, llm, *, cache_size: int = 256, ttl_s: float = 3600.0, clock=time.monotonic,
                 min_words: int = 3):
        self.rules, self.llm = rules, llm
        self.cache_size, self.ttl_s, self.clock, self.min_words = cache_size, ttl_s, clock, min_words
        self._cache: "OrderedDict[str, tuple]" = OrderedDict()
        self._lock = Lock()
        self.stats = {"rules": 0, "cache": 0, "llm": 0, "fallback": 0}

    def needs_llm(self, text: str, rules_result: ExtractionResult) -> bool:
        if rules_result.status != "ok":
            return False
        missing = set(rules_result.missing_slots) & {"origin", "duration_min"}
        if not missing:
            return False
        if rules_result.rejected_fields:
            return False  # out-of-range values must be corrected by the user, not guessed by a model
        words = fold(text).split()
        if len(words) < self.min_words:
            return False  # too short to carry information a model could add
        if "origin" in missing:
            folded = " " + " ".join(words) + " "
            return any(cue in folded or folded.startswith(" " + cue) for cue in _PLACE_CUES) or "duration_min" in missing
        return True

    def _key(self, text: str, prior: Optional[Preferences]) -> str:
        cleaned, _ = _clean(text[:MAX_TEXT])
        body = fold(cleaned) + "|" + repr(prior)
        return hashlib.sha256(body.encode("utf-8")).hexdigest()

    def extract(self, text: str, prior: Optional[Preferences] = None) -> ExtractionResult:
        base = self.rules.extract(text, prior)
        if not self.needs_llm(text, base):
            self.stats["rules"] += 1
            return replace(base, llm_calls=0)
        key = self._key(text, prior)
        now = self.clock()
        with self._lock:
            hit = self._cache.get(key)
            if hit and now - hit[0] <= self.ttl_s:
                self._cache.move_to_end(key)
                self.stats["cache"] += 1
                return replace(hit[1], source="cache", llm_calls=0)
        out = self.llm.extract(text, prior)
        if out.status == "ok":
            with self._lock:
                self._cache[key] = (now, out)
                while len(self._cache) > self.cache_size:
                    self._cache.popitem(last=False)
                self.stats["llm"] += 1
            return replace(out, llm_calls=max(1, out.llm_calls))
        self.stats["fallback"] += 1
        note = "Mô hình ngôn ngữ chưa phản hồi được; đã dùng bộ luật trích xuất cục bộ."
        return replace(base, notes=tuple(base.notes) + (note,), llm_calls=out.llm_calls)
