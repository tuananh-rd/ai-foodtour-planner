"""Provider interfaces the planner depends on. Implementations live outside the planner."""
from __future__ import annotations

import math
from typing import Protocol

from .types import Leg


class RouteMatrixProvider(Protocol):
    """Walking leg between two (lat, lon) points. Must label its source; never invent a route."""

    def leg(self, a: tuple, b: tuple) -> Leg: ...


def haversine_km(a: tuple, b: tuple) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(h)))


class StraightLineEstimator:
    """Default provider: great-circle distance * detour factor at walking speed.

    Always labelled `straight_line_estimate`; strict mode must refuse it.
    """

    def __init__(self, speed_kmh: float = 4.8, detour: float = 1.3):
        self.speed_kmh, self.detour = speed_kmh, detour

    def leg(self, a: tuple, b: tuple) -> Leg:
        km = haversine_km(a, b)
        minutes = math.ceil(km * self.detour / self.speed_kmh * 60)
        return Leg(minutes=minutes, km=round(km, 3), source="straight_line_estimate")
