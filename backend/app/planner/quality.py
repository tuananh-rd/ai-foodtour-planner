"""Soft ranking signals from source-reported metadata (UPGRADE_PLAN 5.3, contract v1.6). Pure, stdlib only.

Honesty rules:
- rating/review_count are *as reported by the source*; they are never evidence of opening hours,
  per-person price or quality guarantees, and they only ever act as small tie-breakers after
  interest relevance (a venue that does not match the interests is never promoted by rating).
- a rating backed by few reviews is pulled toward the dataset mean (Bayesian smoothing), so
  "5.0 from 1 review" does not beat "4.4 from 400 reviews".
- the "well rated" reason is shown only with enough reviews (WELL_RATED_MIN_COUNT).
"""
from __future__ import annotations

from typing import Optional

from .relevance import fold
from .types import Preferences, Venue

SMOOTHING_M = 20          # pseudo-reviews pulling toward the dataset mean
DEFAULT_PRIOR = 3.5       # used only when the pool has no rating at all
WELL_RATED_MIN_COUNT = 20
WELL_RATED_MIN_SCORE = 4.0
MAX_REVIEW_COUNT = 10_000_000   # source counts above this are data errors; treated as unknown

# Source vocabulary (Vietnamese labels in the CSV) per meal / audience.
MEAL_LABELS = {
    "breakfast": ("buoi sang",),
    "lunch": ("buoi trua",),
    "snack": ("buoi xe",),
    "dinner": ("buoi toi",),
    "late": ("buoi khuya",),
}
AUDIENCE_LABELS = {
    "family": ("an gia dinh",),
    "friends": ("hop nhom", "uong bia nhau"),
}
MEAL_NAME_VI = {"breakfast": "bữa sáng", "lunch": "bữa trưa", "snack": "bữa xế", "dinner": "bữa tối", "late": "bữa khuya"}


def meal_from_minutes(start_min: Optional[int]) -> Optional[str]:
    if start_min is None:
        return None
    h = (start_min // 60) % 24
    m = start_min % 60
    t = h * 60 + m
    if 5 * 60 <= t < 10 * 60 + 30:
        return "breakfast"
    if 10 * 60 + 30 <= t < 14 * 60:
        return "lunch"
    if 14 * 60 <= t < 17 * 60 + 30:
        return "snack"
    if 17 * 60 + 30 <= t < 22 * 60:
        return "dinner"
    return "late"


def effective_meal(prefs: Preferences) -> Optional[str]:
    return prefs.meal or meal_from_minutes(prefs.start_time_min)


def dataset_mean_rating(venues) -> float:
    vals = [v.rating for v in venues if v.rating is not None and 0 <= v.rating <= 5]
    return sum(vals) / len(vals) if vals else DEFAULT_PRIOR


def smoothed_rating(v: Venue, prior: float) -> Optional[float]:
    """0..5 or None when the source gave no usable rating."""
    if v.rating is None or not 0 <= v.rating <= 5:
        return None
    n = _count(v)
    return (n * v.rating + SMOOTHING_M * prior) / (n + SMOOTHING_M)


def _count(v: Venue) -> int:
    n = v.review_count
    if isinstance(n, bool) or not isinstance(n, int) or not 0 < n <= MAX_REVIEW_COUNT:
        return 0
    return n


def meal_fit(v: Venue, meal: Optional[str]) -> bool:
    if not meal or not v.suitable_meals:
        return False
    have = {fold(x) for x in v.suitable_meals}
    return any(label in have for label in MEAL_LABELS.get(meal, ()))


def audience_fit(v: Venue, audience: Optional[str]) -> bool:
    if not audience or not v.audiences:
        return False
    have = {fold(x) for x in v.audiences}
    return any(label in have for label in AUDIENCE_LABELS.get(audience, ()))


def soft_score(v: Venue, prefs: Preferences, prior: float, weight: float = 1.0) -> float:
    """Small additive score in roughly [0, 3.2]; weight 0 disables every soft signal."""
    if weight <= 0:
        return 0.0
    score = 0.0
    q = smoothed_rating(v, prior)
    if q is not None:
        score += (q / 5.0) * 1.2          # 0..1.2
    if meal_fit(v, effective_meal(prefs)):
        score += 1.0
    if audience_fit(v, prefs.audience):
        score += 1.0
    return round(score * weight, 3)


def well_rated(v: Venue) -> bool:
    return (v.rating is not None and 0 <= v.rating <= 5 and v.rating >= WELL_RATED_MIN_SCORE
            and _count(v) >= WELL_RATED_MIN_COUNT)


def matched_interests(v: Venue, interests: tuple) -> list:
    """Interest terms (as the user wrote them) that this venue actually matches."""
    from .relevance import interest_score
    return [i for i in interests if i and i.strip() and interest_score(v, (i,)) > 0]
