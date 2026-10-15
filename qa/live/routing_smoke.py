"""LIVE walking-routing smoke test. Makes REAL provider calls; run only after you configured one.

Uses only public landmark coordinates (no private venue data). Prints aggregate results only.
Usage (from repo root):
  $env:PYTHONPATH='backend'
  $env:FOODTOUR_ROUTING='ors'; $env:ORS_API_KEY='...'            # or put them in backend/.env
  python qa/live/routing_smoke.py
  # OSRM: $env:FOODTOUR_ROUTING='osrm'; $env:FOODTOUR_ROUTING_ENDPOINT='https://...'
  #       and add that host to FOODTOUR_PROVIDER_HOSTS
Exit code 0 only when the provider returned walking legs AND per-leg geometry.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import load_local_env  # noqa: E402

load_local_env()

from app.planner.interfaces import haversine_km  # noqa: E402
from app.providers.walking import ORSWalkingProvider, OSRMWalkingProvider  # noqa: E402

# Public landmarks around Hoàn Kiếm (approximate, not venue data).
POINTS = [(21.0285, 105.8522), (21.0287, 105.8490), (21.0340, 105.8510)]
NAMES = ["Hồ Gươm", "Nhà thờ Lớn", "Phố cổ"]


def main() -> int:
    mode = os.getenv("FOODTOUR_ROUTING", "").strip().casefold()
    if mode == "ors":
        p = ORSWalkingProvider(daily_budget=5)
    elif mode == "osrm":
        p = OSRMWalkingProvider(os.getenv("FOODTOUR_ROUTING_ENDPOINT"), daily_budget=5)
    else:
        print("Set FOODTOUR_ROUTING=ors|osrm first.", file=sys.stderr)
        return 2
    if not p.configured:
        print(f"{mode}: not configured (missing key/endpoint or host not allowlisted).", file=sys.stderr)
        return 2
    t0 = time.perf_counter()
    prepared = p.prepare(POINTS)
    matrix_ms = round((time.perf_counter() - t0) * 1000)
    legs = []
    for (a, b), (na, nb) in zip(zip(POINTS, POINTS[1:]), zip(NAMES, NAMES[1:])):
        leg = p.leg(a, b)
        crow = haversine_km(a, b)
        speed = (leg.km / (leg.minutes / 60)) if leg.minutes else None
        legs.append({"from": na, "to": nb, "source": leg.source, "minutes": leg.minutes, "km": leg.km,
                     "straight_line_km": round(crow, 3),
                     "detour_ratio": round(leg.km / crow, 2) if leg.minutes and crow else None,
                     "implied_kmh": round(speed, 1) if speed else None})
    t1 = time.perf_counter()
    lines = p.geometry(POINTS)
    route_ms = round((time.perf_counter() - t1) * 1000)
    geom = None
    if lines:
        geom = [{"points": len(line), "starts_at_from": math.isclose(line[0][0], POINTS[i][0], abs_tol=0.002),
                 "ends_at_to": math.isclose(line[-1][0], POINTS[i + 1][0], abs_tol=0.002)}
                for i, line in enumerate(lines)]
    report = {"provider": p.name, "matrix_ok": prepared, "matrix_ms": matrix_ms, "legs": legs,
              "geometry": geom, "route_ms": route_ms, "calls_today": p.calls_today, "last_error": p.last_error}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    ok = prepared and all(l["source"] == "provider_route" for l in legs) and bool(geom)
    # Walking sanity: 2-7 km/h implied speed and a detour ratio >= ~1 (a route cannot beat a straight line).
    plausible = all(l["implied_kmh"] and 2 <= l["implied_kmh"] <= 7 and l["detour_ratio"] >= 0.95 for l in legs)
    print("RESULT:", "PASS" if ok and plausible else "FAIL", "(walking-plausible)" if plausible else "")
    return 0 if ok and plausible else 1


if __name__ == "__main__":
    raise SystemExit(main())
