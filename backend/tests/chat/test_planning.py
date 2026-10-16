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


class SummaryContract(unittest.TestCase):
    def test_confirm_summary_status_values_follow_the_contract(self):
        from app.chat.engine import ChatEngine
        from app.chat.state import ChatState
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        eng = ChatEngine(data.venues)
        st, pr = ChatState(), Preferences()
        for kw in ({"action": {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}}, {"text": "tìm quán chè"}, {"text": "Thêm A"},
                   {"text": "tạo lịch đi"}, {"text": "16 giờ đến 18 giờ, đi bộ, dị ứng cua"}):
            r = eng.handle(st, pr, **kw)
            st, pr = r.state, r.prefs
        summ = next(b for b in r.blocks if b["type"] == "confirm_summary")
        self.assertTrue({i["status"] for i in summ["items"]} <= {"user", "inferred", "default", "missing"})


class HardPreferences(unittest.TestCase):
    def setUp(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        self.by = {v.id: v for v in data.venues}
        near = sorted((v for v in data.venues if v.district == "Hoàn Kiếm"), key=lambda v: v.id)
        self.ids = [v.id for v in near[:3]]
        self.base = dict(origin=(21.0285, 105.8522), start_time_min=16 * 60, duration_min=240)

    def test_exclusion_added_after_selection_is_reported_not_ignored(self):
        word = self.by[self.ids[0]].dish_tags[0]
        t = plan_selected(self.by, self.ids, Preferences(**self.base, exclusions=(word,)), StraightLineEstimator())
        self.assertEqual((t.status, t.stops), ("no_solution", ()))

    def test_strict_mode_is_not_relaxed(self):
        t = plan_selected(self.by, self.ids, Preferences(**self.base, mode="strict"), StraightLineEstimator())
        self.assertNotEqual(t.status, "verified_feasible")
        self.assertIn(t.status, ("insufficient_evidence", "no_solution"))
        self.assertEqual(t.stops, ())


class AfterPlan(unittest.TestCase):
    def setUp(self):
        from app.chat.engine import ChatEngine
        from app.chat.state import ChatState
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        self.eng = ChatEngine(data.venues)
        self.by = {v.id: v for v in data.venues}
        st, pr = ChatState(), Preferences()
        for kw in ({"action": {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}}, {"text": "tìm quán chè"}, {"text": "Thêm A"},
                   {"text": "tìm quán phở"}, {"text": "Thêm B"}, {"text": "tạo lịch đi"}, {"text": "16 giờ đến 16 giờ 50, đi bộ"}):
            r = self.eng.handle(st, pr, **kw)
            st, pr = r.state, r.prefs
        self.st, self.pr = st, pr

    def test_conflict_offers_options_and_never_changes_silently(self):
        from app.planner.types import Tour
        before = self.st.to_json()["profile"]["max_leg_min"]
        tour = Tour("no_solution", reasons=("Không đủ thời gian",), proposed_changes=("x",))
        blocks = self.eng.after_plan(self.st, tour)
        clar = next(b for b in blocks if b["type"] == "clarify")
        self.assertTrue(any(o["option_id"].startswith("drop:") for o in clar["options"]))
        self.assertEqual(self.st.to_json()["profile"]["max_leg_min"], before)
        self.assertEqual(self.st.pending.kind, "clarify_intent")
        r = self.eng.handle(self.st, self.pr, action={"type": "pick_option", "option_id": "vehicle:motorbike"})
        self.assertEqual(r.state.profile["vehicle"].value, "motorbike")
        self.assertEqual(r.state.pending.kind, "confirm_plan")  # re-confirmation required
        self.assertIsNone(r.plan_request)

    def test_success_text_is_honest(self):
        from app.chat.planning import plan_selected
        pr = self.eng._to_prefs(self.st, self.pr)
        pr = Preferences(origin=pr.origin, start_time_min=16 * 60, duration_min=240)
        t = plan_selected(self.by, [s.venue_id for s in self.st.shortlist], pr, StraightLineEstimator())
        txt = " ".join(b.get("text", "") for b in self.eng.after_plan(self.st, t))
        self.assertIn("chưa được xác minh", txt)
        self.assertNotIn("đang mở", txt)

    def test_modify_plan_requests_a_replacement_only_after_planning(self):
        r = self.eng.handle(self.st, self.pr, text="đổi quán thứ hai trong tour")
        self.assertIsNone(r.replace_request)
        self.st.phase = "planned"
        r = self.eng.handle(self.st, self.pr, text="đổi quán thứ hai trong tour")
        self.assertEqual(r.replace_request, {"refs": ["2"]})
