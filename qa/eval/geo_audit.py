"""Coordinate PLAUSIBILITY audit (P3-7). Aggregate counts only; never prints names/addresses/URLs/ids.

This is not geoverification: it flags coordinates that are implausible relative to the city box,
the venue's own district label and other venues. A flag means "check this", not "wrong";
no flag does not mean "verified".

Usage: PYTHONPATH=backend python qa/eval/geo_audit.py [--data <absolute csv/json>] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.data.loader import load_dataset  # noqa: E402
from app.planner.interfaces import haversine_km  # noqa: E402

# Generous box around Hà Nội's urban districts (not an administrative boundary).
HANOI_BOX = (20.85, 21.25, 105.65, 106.05)
DISTRICT_OUTLIER_KM = 4.0


def audit(venues) -> dict:
    physical = [v for v in venues if not v.online_only]
    out_of_box = sum(1 for v in physical
                     if not (HANOI_BOX[0] <= v.lat <= HANOI_BOX[1] and HANOI_BOX[2] <= v.lon <= HANOI_BOX[3]))
    pairs = Counter((round(v.lat, 6), round(v.lon, 6)) for v in physical)
    shared = sum(n for n in pairs.values() if n > 1)
    by_district = defaultdict(list)
    for v in physical:
        if v.district:
            by_district[v.district].append(v)
    outliers, checked, small = 0, 0, 0
    for group in by_district.values():
        if len(group) < 5:
            small += len(group)
            continue  # too few points for a robust centre
        centre = (statistics.median(v.lat for v in group), statistics.median(v.lon for v in group))
        for v in group:
            checked += 1
            if haversine_km(centre, (v.lat, v.lon)) > DISTRICT_OUTLIER_KM:
                outliers += 1
    return {
        "venues_total": len(venues), "physical_venues": len(physical),
        "outside_city_box": out_of_box,
        "venues_sharing_exact_coordinates": shared,
        "district_labels": len(by_district),
        "district_checked": checked, "district_skipped_small_groups": small,
        f"farther_than_{DISTRICT_OUTLIER_KM:g}km_from_own_district_median": outliers,
        "geo_ok_flag_false": sum(1 for v in venues if not v.geo_ok),
        "note": "Plausibility flags only; not geoverification.",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--json")
    a = ap.parse_args()
    ds = load_dataset(a.data) if a.data else load_dataset()
    report = {"dataset": {"source": ds.dataset_source, "version": ds.dataset_version[:12]}, **audit(ds.venues)}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if a.json:
        Path(a.json).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
