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
