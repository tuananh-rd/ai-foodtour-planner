"""Real walking routing with geometry: openrouteservice (foot-walking) and OSRM-compatible (foot).

Planner contract: `leg(a, b) -> Leg` (directed, never raises; unknown on any failure),
optional `prepare(points)` to fetch a whole duration/distance matrix in one call, and
`geometry(points) -> list[list[(lat, lon)]] | None` for the final tour legs (display only).
Durations/distances come only from the provider; nothing is estimated here.
"""
from __future__ import annotations

import datetime as _dt
import json
import math
import os
from collections import OrderedDict
from threading import RLock

from app.llm.provider import ProviderError
from app.planner.types import Leg
from .http_transport import allow_host, provider_endpoint, request_bytes

UNKNOWN = Leg(minutes=None, km=0.0, source="unknown")
MAX_POINTS = 50
MAX_GEOMETRY_POINTS = 5000
ORS_HOST = "api.openrouteservice.org"
ORS_BASE = "https://" + ORS_HOST


def _point(p):
    if (not isinstance(p, (tuple, list)) or len(p) != 2
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in p)
            or not (-90 <= p[0] <= 90 and -180 <= p[1] <= 180)):
        raise ValueError
    return (float(p[0]), float(p[1]))


def _num(v, upper):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= upper:
        raise ValueError
    return float(v)


def _line(coords):
    """GeoJSON [[lon, lat], ...] -> [(lat, lon), ...] with validation."""
    if not isinstance(coords, list) or not 2 <= len(coords) <= MAX_GEOMETRY_POINTS:
        raise ValueError
    out = []
    for c in coords:
        if not isinstance(c, list) or len(c) < 2:
            raise ValueError
        out.append(_point((c[1], c[0])))
    return out


class WalkingRouteProvider:
    name = "base"

    def __init__(self, *, timeout_s=10.0, cache_size=20000, daily_budget=None):
        self.timeout_s = timeout_s
        self.cache_size = max(16, cache_size)
        budget = daily_budget if daily_budget is not None else os.getenv("FOODTOUR_ROUTING_DAILY_BUDGET", "400")
        try:
            self.daily_budget = max(0, int(budget))
        except (TypeError, ValueError):
            self.daily_budget = 400
        self._legs, self._geoms = OrderedDict(), OrderedDict()
        self._lock = RLock()
        self._day, self.calls_today = None, 0
        self.reachable = False
        self.last_error = None

    # -- subclass hooks -------------------------------------------------------
    @property
    def configured(self) -> bool:
        raise NotImplementedError

    def _matrix(self, points):  # -> (durations[s][d] seconds|None, distances[s][d] meters|None)
        raise NotImplementedError

    def _route(self, points):  # -> list of per-leg lines [(lat, lon), ...]
        raise NotImplementedError

    # -- shared ---------------------------------------------------------------
    def _admit(self):
        today = _dt.datetime.now(_dt.timezone.utc).date()
        if self._day != today:
            self._day, self.calls_today = today, 0
        if self.calls_today >= self.daily_budget:
            raise ProviderError("quota")
        self.calls_today += 1

    def _store(self, a, b, leg):
        self._legs[(a, b)] = leg
        self._legs.move_to_end((a, b))
        while len(self._legs) > self.cache_size:
            self._legs.popitem(last=False)

    def prepare(self, points) -> bool:
        """Fetch all directed legs between the given points in one matrix call (bounded)."""
        try:
            pts = list(dict.fromkeys(_point(p) for p in points))[:MAX_POINTS]
        except (ValueError, TypeError):
            return False
        with self._lock:
            missing = [(a, b) for a in pts for b in pts if a != b and (a, b) not in self._legs]
            if not missing or not self.configured or len(pts) < 2:
                return not missing
            try:
                self._admit()
                durations, distances = self._matrix(pts)
                n = len(pts)
                if (not isinstance(durations, list) or len(durations) != n
                        or not isinstance(distances, list) or len(distances) != n):
                    raise ValueError
                for i, a in enumerate(pts):
                    if not isinstance(durations[i], list) or len(durations[i]) != n or len(distances[i]) != n:
                        raise ValueError
                    for j, b in enumerate(pts):
                        if i == j:
                            continue
                        sec, met = durations[i][j], distances[i][j]
                        if sec is None or met is None:
                            self._store(a, b, Leg(None, 0.0, "unknown"))  # provider says unreachable
                            continue
                        sec, met = _num(sec, 86400), _num(met, 1_000_000)
                        self._store(a, b, Leg(math.ceil(sec / 60), round(met / 1000, 3), "provider_route"))
                self.reachable, self.last_error = True, None
                return True
            except ProviderError as e:
                self.reachable, self.last_error = False, e.kind
                return False
            except Exception:
                self.reachable, self.last_error = False, "bad_response"
                return False

    def leg(self, a, b) -> Leg:
        try:
            a, b = _point(a), _point(b)
        except (ValueError, TypeError):
            return UNKNOWN
        with self._lock:
            if (a, b) in self._legs:
                self._legs.move_to_end((a, b))
                return self._legs[(a, b)]
        if a == b:
            return Leg(0, 0.0, "provider_route") if self.configured else UNKNOWN
        self.prepare([a, b])
        with self._lock:
            return self._legs.get((a, b), UNKNOWN)

    def geometry(self, points):
        """Per-leg polylines for consecutive points, or None when unavailable (never estimated)."""
        try:
            pts = tuple(_point(p) for p in points)
        except (ValueError, TypeError):
            return None
        if len(pts) < 2 or len(pts) > 12 or not self.configured:
            return None
        with self._lock:
            if pts in self._geoms:
                return self._geoms[pts]
            try:
                self._admit()
                lines = self._route(list(pts))
                if not isinstance(lines, list) or len(lines) != len(pts) - 1:
                    raise ValueError
                self._geoms[pts] = lines
                while len(self._geoms) > 256:
                    self._geoms.popitem(last=False)
                return lines
            except ProviderError as e:
                self.last_error = e.kind
                return None
            except Exception:
                self.last_error = "bad_response"
                return None


class ORSWalkingProvider(WalkingRouteProvider):
    """openrouteservice foot-walking. Key from ORS_API_KEY (Authorization header); never logged."""

    name = "ors"

    def __init__(self, base_url: str = ORS_BASE, *, api_key_env="ORS_API_KEY", **kw):
        super().__init__(**kw)
        if base_url.rstrip("/") == ORS_BASE:
            allow_host(ORS_HOST)  # only because this provider was explicitly enabled
        self.base = provider_endpoint(base_url)
        self.api_key_env = api_key_env

    @property
    def configured(self) -> bool:
        return bool(self.base) and bool(os.getenv(self.api_key_env, "").strip())

    def _post(self, path, payload, max_bytes):
        headers = {"Content-Type": "application/json", "Accept": "application/json, application/geo+json",
                   "Authorization": os.getenv(self.api_key_env, "").strip()}
        raw = request_bytes(self.base + path, body=json.dumps(payload).encode("utf-8"), headers=headers,
                            deadline_s=self.timeout_s, max_bytes=max_bytes)
        return json.loads(raw.decode("utf-8"))

    def _matrix(self, points):
        data = self._post("/v2/matrix/foot-walking",
                          {"locations": [[lon, lat] for lat, lon in points],
                           "metrics": ["duration", "distance"], "units": "m"}, 512 * 1024)
        return data.get("durations"), data.get("distances")

    def _route(self, points):
        data = self._post("/v2/directions/foot-walking/geojson",
                          {"coordinates": [[lon, lat] for lat, lon in points]}, 2 * 1024 * 1024)
        feature = data["features"][0]
        line = feature["geometry"]["coordinates"]
        wps = feature["properties"]["way_points"]
        if (not isinstance(wps, list) or len(wps) != len(points)
                or any(isinstance(w, bool) or not isinstance(w, int) for w in wps)
                or wps[0] != 0 or wps[-1] != len(line) - 1 or wps != sorted(wps)):
            raise ValueError
        return [_line(line[wps[i]:wps[i + 1] + 1]) for i in range(len(points) - 1)]


class OSRMWalkingProvider(WalkingRouteProvider):
    """OSRM-compatible server with a foot profile (self-hosted or an explicitly allowlisted host)."""

    name = "osrm"

    def __init__(self, base_url: str | None, *, profile="foot", **kw):
        super().__init__(**kw)
        self.base = provider_endpoint(base_url)
        self.profile = profile

    @property
    def configured(self) -> bool:
        return bool(self.base)

    @staticmethod
    def _coords(points):
        return ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)

    def _get(self, url, max_bytes):
        data = json.loads(request_bytes(url, deadline_s=self.timeout_s, max_bytes=max_bytes).decode("utf-8"))
        if not isinstance(data, dict) or data.get("code") != "Ok":
            raise ValueError
        return data

    def _matrix(self, points):
        data = self._get(f"{self.base}/table/v1/{self.profile}/{self._coords(points)}?annotations=duration,distance",
                         512 * 1024)
        return data.get("durations"), data.get("distances")

    def _route(self, points):
        data = self._get(f"{self.base}/route/v1/{self.profile}/{self._coords(points)}"
                         "?overview=false&geometries=geojson&steps=true", 2 * 1024 * 1024)
        legs = data["routes"][0]["legs"]
        if not isinstance(legs, list) or len(legs) != len(points) - 1:
            raise ValueError
        lines = []
        for leg in legs:
            coords = []
            for step in leg["steps"]:
                part = step["geometry"]["coordinates"]
                coords.extend(part if not coords else part[1:])
            lines.append(_line(coords))
        return lines
