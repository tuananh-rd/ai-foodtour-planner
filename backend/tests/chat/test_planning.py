import unittest
from pathlib import Path

from app.chat.planning import plan_selected
from app.data import loader
from app.planner.interfaces import StraightLineEstimator
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]


class PlanSelected(unittest.TestCase):
    def setUp(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        self.by = {v.id: v for v in data.venues}
        near = sorted((v for v in data.venues if v.district == "Hoàn Kiếm"), key=lambda v: v.id)
        self.ids = [v.id for v in near[:3]]
        self.base = Preferences(origin=(21.0285, 105.8522), start_time_min=16 * 60, duration_min=240)

    def test_all_selected_kept_in_one_valid_tour(self):
        t = plan_selected(self.by, self.ids, self.base, StraightLineEstimator())
        self.assertIn(t.status, ("conditional", "verified_feasible"))
        self.assertEqual(sorted(s.venue_id for s in t.stops), sorted(self.ids))

    def test_never_returns_a_smaller_tour_silently(self):
        t = plan_selected(self.by, self.ids, Preferences(origin=self.base.origin, start_time_min=16 * 60, duration_min=60), StraightLineEstimator())
        self.assertEqual(t.status, "no_solution")
        self.assertEqual(t.stops, ())
        self.assertTrue(t.proposed_changes)

    def test_allergen_venue_is_reported_not_planned(self):
        crab = next(v for v in self.by.values() if "Cua" in v.dish_tags)
        t = plan_selected(self.by, [crab.id], Preferences(origin=(crab.lat, crab.lon), start_time_min=16 * 60, duration_min=120, allergies=("cua",)),
                          StraightLineEstimator())
        self.assertEqual((t.status, t.stops), ("no_solution", ()))

    def test_vehicle_changes_eta_label_stays_estimate(self):
        walk = plan_selected(self.by, self.ids, self.base, StraightLineEstimator(), "walk")
        car = plan_selected(self.by, self.ids, self.base, StraightLineEstimator(), "car")
        self.assertLessEqual(car.walk_minutes, walk.walk_minutes)
        self.assertEqual(car.leg_source, "straight_line_estimate")


if __name__ == "__main__":
    unittest.main()
