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


class CheckedRouteProvider:
    """Wrap any provider: never trust its output and never let its failures crash planning.

    Invalid or failing answers become an `unknown` leg (minutes=None), which the planner treats
    as unreachable rather than inventing a duration. Only sources the planner understands pass.
    """

    MAX_MINUTES = 24 * 60

    def __init__(self, inner: RouteMatrixProvider):
        self.inner = inner

    def leg(self, a: tuple, b: tuple) -> Leg:
        km = 0.0
        try:
            for lat, lon in (a, b):
                if (isinstance(lat, bool) or isinstance(lon, bool)
                        or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float))
                        or not (math.isfinite(lat) and math.isfinite(lon))
                        or not (-90 <= lat <= 90 and -180 <= lon <= 180)):
                    raise ValueError
            km = round(haversine_km(a, b), 3)
            out = self.inner.leg(a, b)
            minutes, src = out.minutes, out.source
            if src not in ("provider_route", "straight_line_estimate", "unknown"):
                raise ValueError
            if minutes is not None and (isinstance(minutes, bool) or not isinstance(minutes, int)
                                        or not 0 <= minutes <= self.MAX_MINUTES):
                raise ValueError
            if isinstance(out.km, bool) or not isinstance(out.km, (int, float)) or not 0 <= out.km < 1000:
                raise ValueError
            return Leg(minutes=minutes, km=float(out.km), source=src if minutes is not None else "unknown")
        except Exception:
            return Leg(minutes=None, km=km, source="unknown")
