"""Quality evaluation harness (U2). Aggregate output only: never prints venue names/addresses/urls.

Usage (from repo root, with a Python that has no extra deps):
  PYTHONPATH=backend python qa/eval/run_eval.py [--data <absolute csv/json>] [--json out.json]

Reports extraction success separately from plan validity. Gate: every returned tour must
pass planner.validate_tour (validity 100%); exit code 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.data.loader import load_dataset  # noqa: E402
from app.llm.extract import MockExtractor  # noqa: E402
from app.planner.engine import plan_tour, replace_stop, validate_tour  # noqa: E402
from app.planner.relevance import interest_score  # noqa: E402
from app.planner.types import Preferences  # noqa: E402


def check_extraction(res, sc) -> list:
    p, out = res.preferences, []
    exp = sc.get("expect", {})
    for k, want in exp.items():
        if k == "origin":
            if (p.origin is not None) != bool(want):
                out.append(f"origin presence {p.origin is not None} != {want}")
        elif k == "interests":
            if set(want) - set(p.interests):
                out.append(f"interests missing {sorted(set(want) - set(p.interests))}")
        elif k == "exclusions":
            if set(want) - set(p.exclusions):
                out.append(f"exclusions missing {sorted(set(want) - set(p.exclusions))}")
        elif getattr(p, k) != want:
            out.append(f"{k}={getattr(p, k)!r} != {want!r}")
    if "expect_missing" in sc and sorted(sc["expect_missing"]) != sorted(res.missing_slots):
        out.append(f"missing_slots {sorted(res.missing_slots)} != {sorted(sc['expect_missing'])}")
    if "expect_mode" in sc and p.mode != sc["expect_mode"]:
        out.append(f"mode {p.mode}")
    if "expect_budget" in sc and p.budget_vnd != sc["expect_budget"]:
        out.append(f"budget {p.budget_vnd}")
    return out


def pct(vals, q):
    s = sorted(vals)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))] if s else 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--json")
    ap.add_argument("--repeat", type=int, default=3)
    a = ap.parse_args()
    ds = load_dataset(a.data) if a.data else load_dataset()
    venues = list(ds.venues)
    scenarios = json.loads((Path(__file__).with_name("scenarios.json")).read_text(encoding="utf-8"))["scenarios"]
    ex = MockExtractor()
    rows, lat = [], []
    invalid_total = tours_total = ext_ok = 0
    for sc in scenarios:
        res = ex.extract(sc["text"])
        problems = check_extraction(res, sc)
        ext_ok += not problems
        p = res.preferences
        row = {"id": sc["id"], "extraction_ok": not problems, "extraction_problems": problems,
               "missing_slots": list(res.missing_slots), "plan": None}
        if not res.missing_slots:
            for _ in range(a.repeat):
                t0 = time.perf_counter()
                t = plan_tour(venues, p)
                lat.append((time.perf_counter() - t0) * 1000)
            viol = validate_tour(t, venues, p)  # every Tour object, including empty failure tours
            tours_total += bool(t.stops)
            invalid_total += bool(viol)
            rel = [interest_score(next(v for v in venues if v.id == s.venue_id), p.interests) for s in t.stops]
            row["plan"] = {"status": t.status, "stops": len(t.stops), "valid": not viol, "violations": viol,
                           "unknowns": list(t.unknowns), "pool_truncated": bool(t.assumptions.get("pool_truncated")),
                           "stops_with_tag_match": (sum(1 for r in rel if r >= 3) / len(rel)) if rel and p.interests else None,
                           "status_expected_ok": ("expect_status" not in sc) or t.status == sc["expect_status"]}
            if t.stops:
                r = replace_stop(venues, p, t, t.stops[len(t.stops) // 2].venue_id)
                row["replace"] = {"ok": r.ok, "valid": (not validate_tour(r.tour, venues, p)) if r.ok else None}
                if r.ok and validate_tour(r.tour, venues, p):
                    invalid_total += 1
        rows.append(row)
    summary = {
        "dataset": {"source": ds.dataset_source, "version": ds.dataset_version[:12], "venues": len(venues)},
        "scenarios": len(scenarios),
        "extraction_success": f"{ext_ok}/{len(scenarios)}",
        "tours_returned": tours_total, "invalid_tours": invalid_total,
        "validity_gate": "PASS" if invalid_total == 0 else "FAIL",
        "latency_ms": {"p50": round(pct(lat, .5), 1), "p95": round(pct(lat, .95), 1), "max": round(max(lat, default=0), 1)},
        "all_expected_statuses_ok": all((r["plan"] or {}).get("status_expected_ok", True) for r in rows),
        "rows": rows,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if a.json:
        Path(a.json).write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if invalid_total == 0 and ext_ok == len(scenarios) and summary["all_expected_statuses_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
