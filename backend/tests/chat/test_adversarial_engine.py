"""Engine-level checks for Codex's ADV findings (idk answers never repeat a question; vague add; stale refs; unknown cells)."""
import unittest
from pathlib import Path

from app.chat.engine import ChatEngine
from app.chat.state import ChatState
from app.data import loader
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]


def blocks_text(r, kinds=("text", "clarify")):
    return [b.get("text") or b.get("question") for b in r.blocks if b["type"] in kinds]


class Adv(unittest.TestCase):
    def setUp(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        self.eng = ChatEngine(data.venues)

    def run_turns(self, turns, area=None):
        st, pr = ChatState(), Preferences()
        if area:
            r = self.eng.handle(st, pr, action={"type": "set_location", "location": area})
            st, pr = r.state, r.prefs
        out = []
        for t in turns:
            r = self.eng.handle(st, pr, **({"text": t} if isinstance(t, str) else {"action": t}))
            st, pr = r.state, r.prefs
            out.append(r)
        return out

    def test_adv01_idk_never_repeats_or_replaces_the_open_question(self):
        rs = self.run_turns(["Tìm quán phở gần tôi", "tôi chưa biết", "tôi vẫn chưa biết", "mình chưa rõ"])
        self.assertEqual(rs[0].state.pending.slot, "area")
        for r in rs[1:]:
            self.assertEqual(r.state.pending.slot, "area")  # still the same open question
            self.assertFalse([b for b in r.blocks if b["type"] == "clarify"])  # not asked again
        texts = [blocks_text(r)[0] for r in rs[1:]]
        self.assertNotEqual(texts[0], texts[1])  # wording alternates

    def test_adv04_vague_add_shows_candidates_and_ok_cannot_plan(self):
        rs = self.run_turns(["tìm quán chè", "thêm một quán", "ok"], area={"district": "Hoàn Kiếm"})
        self.assertEqual(rs[1].state.pending.kind, "pick_venue")
        self.assertEqual(rs[1].state.shortlist, [])
        self.assertIsNone(rs[2].plan_request)
        self.assertEqual(rs[2].state.pending.kind, "pick_venue")

    def test_adv14_stale_label_after_empty_search_asks_instead_of_adding(self):
        rs = self.run_turns(["tìm quán phở", "Quán phở bò quanh Hà Đông trong 300 m", "Thêm A"], area={"district": "Hoàn Kiếm"})
        self.assertEqual(rs[2].state.shortlist, [])
        self.assertTrue([b for b in rs[2].blocks if b["type"] == "clarify"])

    def test_unknown_table_cells_say_chua_ro(self):
        rs = self.run_turns(["tìm quán bún", "So sánh A và B về đánh giá"], area={"district": "Hoàn Kiếm"})
        table = next(b for b in rs[1].blocks if b["type"] == "compare_table")
        for row in table["rows"]:
            for cell in row["cells"]:
                if cell["status"] == "unknown":
                    self.assertEqual(cell["value"], "Chưa rõ")


if __name__ == "__main__":
    unittest.main()


class StaleNotice(unittest.TestCase):
    def test_vehicle_change_after_plan_flags_tour_stale(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        eng = ChatEngine(data.venues)
        st, pr = ChatState(), Preferences()
        steps = [{"action": {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}}, {"text": "tìm quán chè"}, {"text": "Thêm A"},
                 {"text": "tạo lịch đi"}, {"text": "16 giờ đến 18 giờ, đi bộ"}, {"action": {"type": "confirm_yes"}}, {"text": "đổi sang đi ô tô"}]
        for kw in steps:
            r = eng.handle(st, pr, **kw)
            st, pr = r.state, r.prefs
        self.assertEqual(r.state.phase, "planned")
        self.assertTrue(r.state.tour_stale)
        self.assertTrue([b for b in r.blocks if b["type"] == "notice" and b["code"] == "tour_stale"])


class CodexReviewC1High(unittest.TestCase):
    def setUp(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        self.eng = ChatEngine(data.venues)

    def drive(self, steps):
        st, pr = ChatState(), Preferences()
        r = None
        for kw in steps:
            r = self.eng.handle(st, pr, **kw)
            st, pr = r.state, r.prefs
        return r

    BASE = [{"action": {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}}, {"text": "tìm quán phở"}, {"text": "Thêm A"},
            {"action": {"type": "edit_profile", "patch": {"start_time": "10:00", "duration_min": 240, "vehicle": "walk"}}}, {"text": "tạo lịch đi"}]

    def test_unrelated_option_can_never_confirm_a_plan(self):
        r = self.drive(self.BASE)
        self.assertEqual(r.state.pending.kind, "confirm_plan")
        for oid in ("scope:group", "district:Cầu Giấy", "geo", "veh:car", "nonsense"):
            r2 = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": oid})
            self.assertIsNone(r2.plan_request, oid)
        r3 = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": "confirm_yes"})
        self.assertIsNotNone(r3.plan_request)  # the offered confirm option does plan

    def test_pick_venue_only_accepts_offered_candidates(self):
        r = self.drive([{"action": {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}}, {"text": "tìm quán chè"}, {"text": "thêm một quán"}])
        self.assertEqual(r.state.pending.kind, "pick_venue")
        offered = {o["option_id"] for o in r.state.pending.options}
        for bad in ({"action": {"type": "pick_option", "option_id": "CHT-144"}}, {"text": "cái thứ 8"}, {"text": "quán thứ 9"}):
            r2 = self.eng.handle(r.state, r.prefs, **bad)
            self.assertEqual(r2.state.shortlist, [])
        good = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": sorted(offered)[0]})
        self.assertEqual(len(good.state.shortlist), 1)

    def test_large_ordinals_never_crash(self):
        r = self.drive([{"action": {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}}, {"text": "tìm quán phở"}])
        for t in ("bỏ quán thứ 12", "thêm quán thứ 99", "so sánh quán thứ 7 và quán thứ 8", "giữ quán thứ 0"):
            self.eng.handle(r.state, r.prefs, text=t)
