"""Deterministic tools over the dataset: search, compare, dish discovery. No LLM, no I/O.

Every value they return is a dataset fact or an explicitly labelled estimate; missing data is "Chưa rõ".
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

from app.planner import allergens
from app.planner.interfaces import haversine_km
from app.planner.quality import (audience_fit, dataset_mean_rating, effective_meal, meal_fit, soft_score,
                                 well_rated)
from app.planner.relevance import excluded, fold, fold_uncached
from app.planner.types import Preferences, Venue
from . import knowledge

DEFAULT_RADIUS_KM = 1.5
MAX_CARDS = 5
LABELS = "ABCDE"
CRITERIA = {
    "distance": "Khoảng cách", "price": "Khoảng giá quán", "rating": "Đánh giá (theo nguồn)",
    "audience": "Phù hợp (theo nguồn)", "meal": "Bữa phù hợp (theo nguồn)",
    "parking_car": "Chỗ đậu ô tô (theo nguồn)", "outdoor": "Bàn ngoài trời (theo nguồn)",
    "capacity": "Sức chứa (theo nguồn)", "prep_time": "Thời gian chuẩn bị (theo nguồn)",
    "hours": "Giờ hoạt động (theo nguồn)",
}
AMENITY_KEYS = {"parking_car": ("Có chỗ đậu ôtô",), "outdoor": ("Có bàn ngoài trời",)}
UNSUPPORTED = {"quiet": "yên tĩnh", "crowd": "ít đông / đông khách", "elderly": "phù hợp người lớn tuổi"}


def tokens(v: Venue) -> list:
    return [fold(v.name).split()] + [fold(t).split() for t in v.dish_tags]


def _in(tok: list, phrase: str) -> bool:
    w = phrase.split()
    n = len(w)
    return n > 0 and any(tok[i:i + n] == w for i in range(len(tok) - n + 1))


def matches(v: Venue, phrases) -> bool:
    toks = tokens(v)
    return any(_in(t, p) for t in toks for p in phrases)


def dish_phrases(dish: str) -> tuple:
    entry = knowledge.lookup_dish(fold_uncached(dish))
    if entry:
        return entry[5]
    f = fold_uncached(dish)
    return (f,) if f else ()


def distance_m(centre, v: Venue) -> Optional[int]:
    if not centre:
        return None
    return int(round(haversine_km(centre, (v.lat, v.lon)) * 1000 / 10.0) * 10)


@dataclass
class SearchResult:
    venues: list           # ordered Venue
    dists: dict            # id -> metres
    considered: int        # venues inside the radius before dish/allergy filters
    excluded_allergen: int
    excluded_avoid: int
    radius_m: int


def search(venues, centre, *, dish=None, radius_km=DEFAULT_RADIUS_KM, prefs: Preferences, allergies=(),
           max_price=None, amenity=None, limit=MAX_CARDS, exclude_ids=()) -> SearchResult:
    prior = dataset_mean_rating(venues)
    phrases = dish_phrases(dish) if dish else ()
    keep, dists, considered, ex_all, ex_avoid = [], {}, 0, 0, 0
    for v in venues:
        if v.city != prefs.city or v.online_only or not v.geo_ok or v.id in exclude_ids:
            continue
        d = haversine_km(centre, (v.lat, v.lon)) if centre else 0.0
        if centre and d > radius_km:
            continue
        considered += 1
        if phrases and not matches(v, phrases):
            continue
        if allergens.allergen_excluded(v, tuple(allergies)):
            ex_all += 1
            continue
        if excluded(v, prefs.exclusions):
            ex_avoid += 1
            continue
        if max_price is not None and not (v.price_min_vnd is not None and v.price_min_vnd <= max_price):
            continue
        if amenity and not any(k in v.amenities_yes for k in AMENITY_KEYS.get(amenity, ())):
            continue
        keep.append((soft_score(v, prefs, prior, 1.0) - 0.8 * d, v.id, v))
        dists[v.id] = distance_m(centre, v)
    keep.sort(key=lambda x: (-round(x[0], 3), x[1]))
    return SearchResult([k[2] for k in keep[:limit]], dists, considered, ex_all, ex_avoid, int(radius_km * 1000))


def _price(v: Venue):
    if v.price_min_vnd is None or v.price_max_vnd is None:
        return None
    return {"min_vnd": v.price_min_vnd, "max_vnd": v.price_max_vnd, "semantics": "venue_range",
            "evidence": v.price_evidence}


_SUSPICIOUS = re.compile(r"\b(?:system|ignore|reveal|prompt|api key|apikey|jailbreak|developer|assistant)\b|dang mo\b|an toan|da xac minh|xac minh|"
                         r"verified|\bsafe\b|/ *nguoi|moi nguoi|gia moi")


def clean_text(text, limit=80) -> str:
    """Dataset strings are shown as DATA: drop control/format characters and markup, bound the length, and remove
    clauses that read like instructions or like claims the app itself must not make (open now, safe, per-person price)."""
    kept = "".join(ch for ch in str(text or "") if unicodedata.category(ch)[0] != "C" or ch == " ")
    kept = re.sub(r"<[^>]*>", " ", kept).replace("<", " ").replace(">", " ")
    parts = [p for p in re.split(r"[;|]", kept) if p.strip() and not _SUSPICIOUS.search(fold_uncached(p))]
    out = []
    for p in parts:  # a ':' that introduces a suspicious tail ("SYSTEM: ...") drops the tail only
        head, sep, tail = p.partition(":")
        out.append(head if sep and _SUSPICIOUS.search(fold_uncached(tail + head)) else p)
    return " ".join(" ".join(out).split())[:limit]


def venue_view(v: Venue) -> dict:
    rating = None
    if v.rating is not None:
        rating = {"value": round(v.rating, 2), "count": v.review_count}
    hours = None
    if v.hours_display:
        hours = {"status": "verified" if v.hours else "unknown", "display": v.hours_display}
    return {"id": v.id, "name": clean_text(v.name), "district": clean_text(v.district, 40), "address": clean_text(v.address, 140),
            "dish_tags": [t for t in (clean_text(x, 40) for x in v.dish_tags[:8]) if t], "price": _price(v), "hours": hours,
            "rating": rating}


def fmt_vnd(n: int) -> str:
    return f"{n:,}".replace(",", ".") + " đ"


def card(label: str, v: Venue, dist: Optional[int], prefs: Preferences, *, dish=None, allergies=(),
         in_shortlist=False) -> dict:
    why = []
    if dish:
        why.append({"code": "match_dish", "text": f"Khớp món bạn hỏi: {dish}"})
    if dist is not None:
        why.append({"code": "near", "text": f"Cách khoảng {dist} m (ước tính đường chim bay)"})
    if well_rated(v):
        why.append({"code": "well_rated", "text": f"Điểm {v.rating:.1f}/5 theo {v.review_count} đánh giá trên nguồn"})
    if meal_fit(v, effective_meal(prefs)):
        why.append({"code": "fits_meal", "text": "Nguồn ghi phù hợp bữa này"})
    if audience_fit(v, prefs.audience):
        why.append({"code": "fits_audience", "text": "Nguồn ghi phù hợp nhóm đi cùng"})
    flags = []
    if allergies:
        flags.append({"code": "allergy_unknown", "text": "Chưa đủ thông tin về dị ứng; hãy hỏi quán trước khi ăn"})
    if not v.hours_display and not v.hours:
        flags.append({"code": "hours_unknown", "text": "Giờ hoạt động: chưa rõ"})
    if v.price_min_vnd is None:
        flags.append({"code": "price_unknown", "text": "Giá: chưa rõ"})
    if v.review_count is None or v.review_count < 5:
        flags.append({"code": "few_reviews", "text": "Ít đánh giá"})
    return {"label": label, "venue": venue_view(v), "distance_m": dist,
            "distance_source": "straight_line_estimate" if dist is not None else "unknown",
            "why": why, "flags": flags, "in_shortlist": in_shortlist}


# ---------------------------------------------------------------------------------------------------
def compare(venues_by_ids: list, centre, criteria: list) -> dict:
    """Table over the criteria the data supports; unsupported asks are listed, never answered."""
    crit = [c for c in criteria if c in CRITERIA] or ["distance", "price", "rating"]
    unsupported = [{"criterion": c, "text": f"Dữ liệu chưa có tiêu chí \"{UNSUPPORTED[c]}\"; chưa có tiêu chí này nên "
                                            "mình không suy diễn từ sao hay ảnh."}
                   for c in criteria if c in UNSUPPORTED]
    cols = [{"label": lab, "venue_id": v.id, "name": v.name} for lab, v in venues_by_ids]
    rows = [{"criterion_id": c, "cells": [_cell(c, v, centre) for _, v in venues_by_ids]} for c in crit]
    return {"criteria": [{"id": c, "label": CRITERIA[c]} for c in crit], "columns": cols, "rows": rows,
            "unsupported": unsupported}


def _cell(c: str, v: Venue, centre) -> dict:
    unknown = {"value": "Chưa rõ", "status": "unknown"}
    if c == "distance":
        d = distance_m(centre, v)
        return unknown if d is None else {"value": f"~{d} m", "status": "estimate", "note": "ước tính đường chim bay"}
    if c == "price":
        p = _price(v)
        if not p:
            return unknown
        return {"value": f"{fmt_vnd(p['min_vnd'])} – {fmt_vnd(p['max_vnd'])}", "status": "source",
                "note": "khoảng giá của quán, không phải giá theo người"}
    if c == "rating":
        if v.rating is None or v.review_count is None or v.review_count < 5:
            return {"value": "Chưa rõ", "status": "unknown", "note": "ít đánh giá"}
        return {"value": f"{v.rating:.1f}/5 ({v.review_count} đánh giá)".replace(".", ","), "status": "source",
                "note": "theo nguồn"}
    if c == "audience":
        return {"value": ", ".join(v.audiences), "status": "source", "note": "theo nguồn"} if v.audiences else unknown
    if c == "meal":
        return ({"value": ", ".join(v.suitable_meals), "status": "source", "note": "theo nguồn"}
                if v.suitable_meals else unknown)
    if c in AMENITY_KEYS:
        if any(k in v.amenities_yes for k in AMENITY_KEYS[c]):
            return {"value": "Nguồn ghi có", "status": "source"}
        return unknown  # amenities_no is empty in the source: absence is never stated
    if c == "capacity":
        cap = getattr(v, "capacity_value", None)
        return {"value": f"{cap} chỗ", "status": "source", "note": "theo nguồn"} if cap is not None else unknown
    if c == "prep_time":
        pt = getattr(v, "prep_time_min", None)
        return {"value": f"~{pt} phút", "status": "source", "note": "theo nguồn"} if pt is not None else unknown
    if c == "hours":
        return ({"value": v.hours_display, "status": "source", "note": "nguồn ghi, chưa rõ áp dụng ngày nào"}
                if v.hours_display else unknown)
    return unknown


# ---------------------------------------------------------------------------------------------------
def discover(venues, centre, *, mood=None, meal=None, dish=None, radius_km=DEFAULT_RADIUS_KM, limit=4) -> list:
    """Dish suggestions: general-knowledge blurb + the number of dataset venues around the centre."""
    named = knowledge.lookup_dish(fold_uncached(dish)) if dish else None
    entries = [named] if named else knowledge.entries_for(mood, meal)
    items = []
    for e in entries:
        n = sum(1 for v in venues
                if v.geo_ok and not v.online_only
                and (not centre or haversine_km(centre, (v.lat, v.lon)) <= radius_km) and matches(v, e[5]))
        items.append({"dish_group": e[1], "blurb": e[2], "venue_count": n, "radius_m": int(radius_km * 1000),
                      "kind": "general_knowledge"})
    items.sort(key=lambda x: (-x["venue_count"], x["dish_group"]))
    return items[:limit]
