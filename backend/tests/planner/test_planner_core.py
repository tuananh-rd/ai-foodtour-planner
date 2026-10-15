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


class ValidateRecompute(unittest.TestCase):
    def setUp(self):
        self.venues = load_fixture()
        self.p = prefs()
        self.t = plan_tour(self.venues, self.p)

    def test_ineligible_venue_fails(self):
        vs = [replace(v, online_only=True) if v.id == self.t.stops[0].venue_id else v for v in self.venues]
        self.assertTrue(validate_tour(self.t, vs, self.p))

    def test_tampered_leg_totals_and_timeline_fail(self):
        s0 = self.t.stops[0]
        bad_leg = replace(self.t, stops=(replace(s0, leg_from_previous=Leg(1, 0.0, "provider_route")),) + self.t.stops[1:])
        self.assertTrue(validate_tour(bad_leg, self.venues, self.p))
        self.assertTrue(validate_tour(replace(self.t, walk_minutes=1), self.venues, self.p))
        self.assertTrue(validate_tour(replace(self.t, venue_range_upper_sum_vnd=1), self.venues, self.p))
        bad_tl = replace(self.t, stops=(replace(s0, arrive_min=5),) + self.t.stops[1:])
        self.assertTrue(validate_tour(bad_tl, self.venues, self.p))

    def test_order_swap_fails_and_clean_passes(self):
        sw = replace(self.t, stops=tuple(reversed(self.t.stops)))
        self.assertTrue(validate_tour(sw, self.venues, self.p))
        self.assertEqual(validate_tour(self.t, self.venues, self.p), [])

    def test_strict_pref_rejects_conditional_tour(self):
        self.assertTrue(validate_tour(self.t, self.venues, replace(self.p, mode="strict")))


class Midnight(unittest.TestCase):
    def test_cross_midnight_is_rejected_not_wrapped(self):
        vs = load_fixture()
        late = plan_tour(vs, prefs(start_time_min=23 * 60 + 30, weekday=0))
        self.assertEqual(late.status, "no_solution")
        early = plan_tour(vs, prefs(start_time_min=20 * 60, weekday=0))
        for s in early.stops:
            self.assertLessEqual(s.depart_min, 1440)


class PoolTruncation(unittest.TestCase):
    def test_truncation_is_disclosed(self):
        vs = load_fixture()
        t = plan_tour(vs, prefs(max_leg_min=0), pool_cap=3)
        self.assertEqual(t.status, "no_solution")
        self.assertTrue(t.assumptions["pool_truncated"])
        self.assertTrue(any("gần nhất" in r for r in t.reasons))
        ok = plan_tour(vs, prefs(), pool_cap=5)
        self.assertTrue(ok.assumptions["pool_truncated"])


class BudgetPruneBeforeCap(unittest.TestCase):
    def test_cheap_venue_beyond_pool_cap_is_found(self):
        vs = [Venue(id=f"TEST-{i:02d}", name="t", lat=21.03, lon=105.85, price_min_vnd=10000,
                    price_max_vnd=200000 if i < 14 else 20000, synthetic=True) for i in range(15)]
        p = Preferences(origin=(21.03, 105.85), duration_min=60, budget_vnd=50000, budget_scope="per_person",
                        max_stops=1)
        t = plan_tour(vs, p)
        self.assertEqual(t.status, "conditional")
        self.assertEqual(t.stops[0].venue_id, "TEST-14")


class BuildTour(unittest.TestCase):
    def test_rebuild_matches_planned_tour_and_rejects_bad_input(self):
        from app.planner.engine import build_tour
        vs = load_fixture()
        p = prefs()
        t = plan_tour(vs, p)
        ids = [s.venue_id for s in t.stops]
        rebuilt, why = build_tour(vs, p, ids)
        self.assertIsNone(why)
        self.assertEqual([s.venue_id for s in rebuilt.stops], ids)
        self.assertEqual(rebuilt.walk_minutes, t.walk_minutes)
        self.assertEqual(validate_tour(rebuilt, vs, p), [])
        self.assertIsNone(build_tour(vs, p, ids + ["NOPE"])[0])
        self.assertIsNone(build_tour(vs, p, [ids[0], ids[0]])[0])
        self.assertIsNone(build_tour(vs, replace(p, mode="strict"), ids)[0])


class CheckedProviderTests(unittest.TestCase):
    def test_bad_provider_output_becomes_unknown_leg(self):
        from app.planner.interfaces import CheckedRouteProvider

        class Bad:
            def __init__(self, leg=None, exc=None):
                self._leg, self._exc = leg, exc

            def leg(self, a, b):
                if self._exc:
                    raise self._exc
                return self._leg

        a, b = (21.03, 105.85), (21.031, 105.851)
        for inner in (Bad(exc=RuntimeError("boom")), Bad(Leg(-5, 0.1, "provider_route")),
                      Bad(Leg(10**6, 0.1, "provider_route")), Bad(Leg(5, float("nan"), "provider_route")),
                      Bad(Leg(5, 0.1, "made_up_source"))):
            out = CheckedRouteProvider(inner).leg(a, b)
            self.assertIsNone(out.minutes)
            self.assertEqual(out.source, "unknown")
        good = CheckedRouteProvider(Bad(Leg(7, 0.5, "provider_route"))).leg(a, b)
        self.assertEqual((good.minutes, good.source), (7, "provider_route"))
        # planner treats an unknown leg as unreachable, never as free
        t = plan_tour(load_fixture(), prefs(), CheckedRouteProvider(Bad(exc=RuntimeError("x"))))
        self.assertEqual(t.status, "no_solution")


class BuildTourMaxStops(unittest.TestCase):
    def test_more_stops_than_max_is_rejected(self):
        from app.planner.engine import build_tour
        vs = load_fixture()
        p = prefs(max_stops=3)
        ids = [s.venue_id for s in plan_tour(vs, p).stops]
        self.assertIsNotNone(build_tour(vs, p, ids)[0])
        self.assertIsNone(build_tour(vs, replace(p, max_stops=1), ids)[0])


class CheckedProviderMalformedInput(unittest.TestCase):
    def test_malformed_coordinates_do_not_raise(self):
        from app.planner.interfaces import CheckedRouteProvider
        out = CheckedRouteProvider(FixedProvider()).leg(("bad", 0), (0, 0))
        self.assertIsNone(out.minutes)
        self.assertEqual(out.source, "unknown")
        out2 = CheckedRouteProvider(FixedProvider()).leg((float("nan"), 0.0), (0.0, 0.0))
        self.assertIsNone(out2.minutes)


if __name__ == "__main__":
    unittest.main()
