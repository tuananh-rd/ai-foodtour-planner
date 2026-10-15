import itertools
import json
import unittest
from dataclasses import replace
from pathlib import Path

from app.planner.engine import eligible, missing_slots, plan_tour, replace_stop, validate_tour, _evaluate, _diversity
from app.planner.interfaces import StraightLineEstimator
from app.planner.types import Leg, Preferences, Venue

FIXTURE = Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "venues.synthetic.json"


def load_fixture():
    out = []
    for r in json.loads(FIXTURE.read_text(encoding="utf-8"))["venues"]:
        r = dict(r)
        r["dish_tags"] = tuple(r["dish_tags"])
        if r["hours"] is not None:
            r["hours"] = {int(k): [tuple(x) for x in v] for k, v in r["hours"].items()}
        out.append(Venue(**r))
    return out


def prefs(**kw):
    base = dict(origin=(21.0290, 105.8510), duration_min=240, budget_vnd=500000, budget_scope="per_person",
                max_stops=3, max_leg_min=25)
    base.update(kw)
    return Preferences(**base)


class FixedProvider:
    def __init__(self, minutes=5, source="provider_route"):
        self.minutes, self.source = minutes, source

    def leg(self, a, b):
        return Leg(self.minutes, 0.4, self.source)


class PlannerCore(unittest.TestCase):
    def setUp(self):
        self.venues = load_fixture()

    def test_excludes_online_nogeo_noprice(self):
        ids = {v.id for v in self.venues if eligible(v, prefs())}
        self.assertNotIn("SYN-009", ids)  # online only
        self.assertNotIn("SYN-010", ids)  # bad geo
        self.assertNotIn("SYN-011", ids)  # unknown price with budget set

    def test_conditional_tour_is_valid_and_labelled(self):
        t = plan_tour(self.venues, prefs())
        self.assertEqual(t.status, "conditional")
        self.assertEqual(len(t.stops), 3)
        self.assertEqual(t.leg_source, "straight_line_estimate")
        self.assertIn("hours", t.unknowns)
        self.assertIn("route", t.unknowns)
        self.assertEqual(validate_tour(t, self.venues, prefs()), [])

    def test_strict_refuses_without_evidence(self):
        t = plan_tour(self.venues, prefs(mode="strict"))
        self.assertEqual(t.status, "insufficient_evidence")
        self.assertEqual(t.stops, ())
        self.assertTrue(t.reasons and t.proposed_changes)

    def test_verified_feasible_requires_all_evidence(self):
        vs = [replace(v, price_evidence="verified", hours={0: [(0, 1440)]}) for v in self.venues]
        p = prefs(weekday=0, start_time_min=600)
        t = plan_tour(vs, p, FixedProvider())
        self.assertEqual(t.status, "verified_feasible")
        self.assertEqual(validate_tour(t, vs, p, FixedProvider()), [])
        strict = plan_tour(vs, replace(p, mode="strict"), FixedProvider())
        self.assertEqual(strict.status, "verified_feasible")

    def test_budget_infeasible_gives_reasons(self):
        t = plan_tour(self.venues, prefs(budget_vnd=1000))
        self.assertEqual(t.status, "no_solution")
        self.assertTrue(t.reasons and t.proposed_changes)

    def test_duration_too_short(self):
        t = plan_tour(self.venues, prefs(duration_min=30))
        self.assertEqual(t.status, "no_solution")
        self.assertTrue(any("Thời lượng" in r for r in t.reasons))

    def test_unreachable_leg(self):
        t = plan_tour(self.venues, prefs(), type("P", (), {"leg": lambda s, a, b: Leg(None, 0, "unknown")})())
        self.assertEqual(t.status, "no_solution")

    def test_closed_at_arrival_is_hard_reject(self):
        vs = [replace(v, hours={0: [(0, 60)]}) for v in self.venues]
        t = plan_tour(vs, prefs(weekday=0, start_time_min=600))
        self.assertEqual(t.status, "no_solution")

    def test_missing_slots(self):
        p = Preferences(budget_vnd=100000)
        self.assertEqual(missing_slots(p), ["origin", "duration_min", "budget_scope"])
        self.assertEqual(plan_tour(self.venues, p).status, "insufficient_evidence")

    def test_interest_and_exclusion(self):
        t = plan_tour(self.venues, prefs(interests=("chè",)))
        for s in t.stops:
            v = next(x for x in self.venues if x.id == s.venue_id)
            self.assertTrue(any("chè" in tag for tag in v.dish_tags))
        t2 = plan_tour(self.venues, prefs(exclusions=("bún",)))
        for s in t2.stops:
            v = next(x for x in self.venues if x.id == s.venue_id)
            self.assertFalse(any("bún" in tag for tag in v.dish_tags))

    def test_far_venue_not_chosen(self):
        t = plan_tour(self.venues, prefs(max_stops=5, duration_min=720))
        self.assertNotIn("SYN-013", [s.venue_id for s in t.stops])

    def test_replace_keeps_other_stops(self):
        p = prefs()
        t = plan_tour(self.venues, p)
        ids = [s.venue_id for s in t.stops]
        r = replace_stop(self.venues, p, t, ids[1])
        self.assertTrue(r.ok, r.reasons)
        new_ids = [s.venue_id for s in r.tour.stops]
        self.assertEqual(new_ids[0], ids[0])
        self.assertEqual(new_ids[2], ids[2])
        self.assertNotIn(new_ids[1], ids)
        self.assertEqual(len(set(new_ids)), 3)
        self.assertEqual(set(r.tour.locks), {ids[0], ids[2]})
        self.assertEqual(validate_tour(r.tour, self.venues, p), [])

    def test_replace_failure_returns_reason_and_unchanged_tour(self):
        p = prefs(interests=("chè",))
        t = plan_tour(self.venues, p)
        tags_chè = [v for v in self.venues if eligible(v, p)]
        only = [v for v in self.venues if v.id in {s.venue_id for s in t.stops}]
        r = replace_stop(only, p, t, t.stops[0].venue_id)
        self.assertFalse(r.ok)
        self.assertEqual(r.tour, t)
        self.assertTrue(r.reasons)
        self.assertEqual(replace_stop(self.venues, p, t, "NOPE").ok, False)
        self.assertTrue(tags_chè)

    def test_validate_catches_tampering(self):
        p = prefs()
        t = plan_tour(self.venues, p)
        bad = replace(t, status="verified_feasible")
        self.assertTrue(validate_tour(bad, self.venues, p))
        dup = replace(t, stops=t.stops + (t.stops[0],))
        self.assertTrue(validate_tour(dup, self.venues, p))

    def test_matches_exact_baseline_on_small_fixture(self):
        """Search must equal brute force over all permutations of the eligible pool."""
        p = prefs(max_stops=3)
        routes = StraightLineEstimator()
        pool = [v for v in self.venues if eligible(v, p)]
        best = None
        for k in range(1, 4):
            for seq in itertools.permutations(pool, k):
                t, _ = _evaluate(list(seq), p, routes)
                if t is None:
                    continue
                key = (-k, -_diversity(seq), t.walk_minutes, tuple(v.id for v in seq))
                if best is None or key < best:
                    best = key
        got = plan_tour(self.venues, p, routes, pool_cap=len(pool))
        self.assertEqual(tuple(s.venue_id for s in got.stops), best[3])


if __name__ == "__main__":
    unittest.main()
