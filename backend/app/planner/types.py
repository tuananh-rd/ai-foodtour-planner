"""Typed planner inputs/outputs. Stdlib only, no I/O. Mirrors contracts/v1/CONTRACT.md."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Literal, Optional

Evidence = Literal["verified", "estimate", "unknown"]
LegSource = Literal["provider_route", "straight_line_estimate", "unknown"]
TourStatus = Literal["verified_feasible", "conditional", "insufficient_evidence", "no_solution"]
Mode = Literal["explore", "strict"]
BudgetScope = Literal["per_person", "group"]

# Opening intervals in minutes since local midnight, per weekday (0=Monday).
Hours = dict  # dict[int, list[tuple[int, int]]]


@dataclass(frozen=True)
class Venue:
    id: str
    name: str
    lat: float
    lon: float
    city: str = "Hà Nội"
    district: str = ""
    address: str = ""
    source_url: str = ""
    dish_tags: tuple = ()
    online_only: bool = False
    geo_ok: bool = True
    price_min_vnd: Optional[int] = None
    price_max_vnd: Optional[int] = None
    # Venue range is never a per-person bill; 'verified' only if the loader proves per-person semantics.
    price_evidence: Evidence = "estimate"
    hours: Optional[Hours] = None  # None = unknown
    hours_display: Optional[str] = None
    synthetic: bool = False
    # Source metadata only; not feasibility evidence (v1.6).
    rating: Optional[float] = None
    rating_scale_max: Optional[float] = None
    review_count: Optional[int] = None
    suitable_meals: tuple = ()
    audiences: tuple = ()
    cuisine_styles: tuple = ()
    amenities_yes: tuple = ()
    amenities_no: tuple = ()
    source_fetched_at: Optional[str] = None


@dataclass(frozen=True)
class Preferences:
    city: str = "Hà Nội"
    origin: Optional[tuple] = None  # (lat, lon)
    start_time_min: Optional[int] = None  # minutes since midnight
    weekday: Optional[int] = None
    duration_min: Optional[int] = None
    budget_vnd: Optional[int] = None
    budget_scope: Optional[BudgetScope] = None
    party_size: Optional[int] = None
    interests: tuple = ()
    exclusions: tuple = ()
    max_stops: int = 3
    mode: Mode = "explore"
    # Display/provenance only; never affects planning (contract v1.5).
    origin_label: Optional[str] = None
    origin_source: Optional[str] = None  # current_location|place|manual_coordinates|landmark|geocoded
    # Soft ranking only (contract v1.6); never hard constraints and never part of validate_tour.
    meal: Optional[str] = None       # breakfast|lunch|snack|dinner|late|None (defaults from start time)
    audience: Optional[str] = None   # solo|friends|family|None
    visit_minutes: int = 45  # explicit exploration assumption, not source data
    max_leg_min: int = 20


@dataclass(frozen=True)
class Leg:
    minutes: Optional[int]
    km: float
    source: LegSource


@dataclass(frozen=True)
class Stop:
    venue_id: str
    order: int
    leg_from_previous: Leg
    arrive_min: Optional[int] = None
    depart_min: Optional[int] = None
    hours_evidence: Evidence = "unknown"
    open_at_arrival: Optional[bool] = None
    price_evidence: Evidence = "estimate"
    # Reasons (code, text) built from validated facts only (contract v1.6).
    why: tuple = ()


@dataclass(frozen=True)
class Tour:
    status: TourStatus
    stops: tuple = ()
    reasons: tuple = ()
    proposed_changes: tuple = ()
    unknowns: tuple = ()
    venue_range_upper_sum_vnd: int = 0
    walk_minutes: Optional[int] = None
    leg_source: LegSource = "unknown"
    locks: tuple = ()
    assumptions: dict = field(default_factory=dict)

    def with_locks(self, locks) -> "Tour":
        return replace(self, locks=tuple(locks))


@dataclass(frozen=True)
class ReplaceResult:
    ok: bool
    tour: Tour
    reasons: tuple = ()
