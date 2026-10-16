"""Intent accuracy of the rules on the labelled corpus (qa/chat/utterances.jsonl). Gate: >= 0.90 overall, no ADD/REMOVE/CONFIRM_YES errors."""
import json
import unittest
from pathlib import Path

from app.chat import gazetteer
from app.chat.state import ChatState, Pending
from app.chat.understand import understand
from app.data import loader

ROOT = Path(__file__).resolve().parents[3]
OPTS = {
    "clarify_slot": [],
    "clarify_intent": [{"option_id": "allergy", "label": "Dị ứng"}, {"option_id": "dislike", "label": "Chỉ là không thích"},
                       {"option_id": "choose_venue", "label": "Chọn quán A"}, {"option_id": "plan", "label": "Lập lịch trình"}],
    "pick_venue": [{"option_id": "A", "label": "A"}, {"option_id": "B", "label": "B"}],
    "confirm_plan": [],
}


class Corpus(unittest.TestCase):
    def test_intent_accuracy(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        gz = gazetteer.Gazetteer(data.venues)
        rows = [json.loads(l) for l in open(ROOT / "qa/chat/utterances.jsonl", encoding="utf-8") if l.strip()]
        bad = []
        for r in rows:
            st = ChatState()
            if r.get("pending"):
                st.pending = Pending("p1", r["pending"], OPTS[r["pending"]], "budget_scope" if r["text"] in ("cả nhóm", "mỗi người") else None)
            got = understand(r["text"], st, gz).intent
            if got != r["intent"]:
                bad.append((r["text"], r["intent"], got))
        acc = 1 - len(bad) / len(rows)
        self.assertGreaterEqual(len(rows), 150)
        self.assertGreaterEqual(acc, 0.90, bad)
        critical = [b for b in bad if b[1] in ("ADD", "REMOVE", "CONFIRM_YES", "SET_ALLERGY", "UNSAFE")]
        self.assertEqual(critical, [])


if __name__ == "__main__":
    unittest.main()
