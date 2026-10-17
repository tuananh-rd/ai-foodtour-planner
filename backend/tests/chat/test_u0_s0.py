"""U0: the user's exact sentence (S0) — acceptance cases A1–A11 of docs/CHATBOT_UX_AI_V2_PLAN.vi.md.

Fail-before: each target test is marked `expectedFailure` and FAILS on the C6 code (evidence in
docs/reports/U0_S0_FAIL_BEFORE.md). U1/U2 delete the marker as they make a case pass; an unexpected pass
is an error, so the markers cannot rot. `ControlCases` already pass and pin what must not regress.
"""
import unittest
from pathlib import Path

from app.chat.engine import ChatEngine
from app.chat.llm_understand import Outcome
from app.chat.state import ChatState
from app.data import loader
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]
S0 = ("Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. "
      "Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.")


def engine():
    data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
    return ChatEngine(data.venues)


class S0Base(unittest.TestCase):
    def setUp(self):
        self.eng = engine()
        self.llm_seen = []

    def turn(self, text=S0, llm=None, st=None, pr=None):
        return self.eng.handle(st or ChatState(), pr or Preferences(), text=text, llm=llm)

    def fake_llm(self, data=None):
        def call(text, compact, used):
            self.llm_seen.append(text)
            return Outcome(data, 1 if data is not None else 0, None if data is not None else "error")
        return call

    def allergy_terms(self, r):
        return " ".join(a.term for a in r.state.allergies).lower()


class ControlCases(S0Base):
    """Already true on C6 — must stay true."""

    def test_c1_total_duration_is_captured_not_leg(self):
        r = self.turn()
        self.assertEqual(r.state.profile["duration_min"].value, 120)
        self.assertNotEqual(r.state.profile["max_leg_min"].source, "user_said")

    def test_c2_s0_never_plans(self):
        r = self.turn()
        self.assertIsNone(r.plan_request)
        self.assertNotEqual(r.state.phase, "planned")

    def test_c3_party_budget_area(self):
        r = self.turn()
        self.assertEqual(r.state.profile["party_size"].value, 2)
        self.assertEqual(r.state.profile["budget"].value, 500000)
        self.assertIn("Gươm", str(r.state.profile["area"].value))


class AllergyAndSlots(S0Base):
    def test_a1_allergy_recorded_by_rules_alone(self):
        r = self.turn()  # no llm callable: rules only
        self.assertIn("phong", self.allergy_terms(r).replace("ộ", "o").replace("ậ", "a"), self.allergy_terms(r))

    def test_a1b_allergy_recorded_when_llm_fails_or_is_exhausted(self):
        r = self.turn(llm=self.fake_llm(None))
        self.assertTrue(r.state.allergies)

    @unittest.expectedFailure
    def test_a3_interests_captured(self):
        r = self.turn()
        tastes = " ".join(r.state.profile["tastes"].value or []).lower()
        self.assertIn("phở", tastes)
        self.assertIn("bún chả", tastes)

    @unittest.expectedFailure
    def test_a4_three_stops_captured(self):
        r = self.turn()
        self.assertEqual(r.state.profile["stops"].value, 3)  # profile.stops added in v1.9

    def test_a5_leg_time_untouched_by_total_minutes(self):
        r = self.turn()
        self.assertEqual(r.state.profile["duration_min"].value, 120)
        self.assertEqual(r.prefs.max_leg_min, 20)  # default stays; 120 is the whole tour

    @unittest.expectedFailure
    def test_a6_budget_scope_is_asked_not_guessed(self):
        r = self.turn()
        self.assertIsNone(r.state.profile["budget"].scope)
        clar = [b for b in r.blocks if b["type"] == "clarify"]
        self.assertEqual(len(clar), 1)
        self.assertEqual(getattr(r.state.pending, "slot", None), "budget_scope")

    @unittest.expectedFailure
    def test_a7_tonight_is_a_day_part_not_a_start_time(self):
        r = self.turn()
        self.assertEqual(r.state.profile["day_part"].value, "evening")  # profile.day_part added in v1.9
        self.assertFalse(r.state.profile["start_time"].known())

    def test_a8_style_directive_does_not_drop_other_slots(self):
        r = self.turn()
        self.assertTrue(r.state.allergies and r.state.profile["duration_min"].known())

    @unittest.expectedFailure
    def test_a9_understood_card_is_emitted(self):
        r = self.turn()
        self.assertTrue([b for b in r.blocks if b["type"] == "understood"])


class Escalation(S0Base):
    @unittest.expectedFailure
    def test_a11_uncovered_signal_triggers_one_llm_call(self):
        r = self.turn(llm=self.fake_llm({}))
        self.assertEqual(len(self.llm_seen), 1, "S0 has uncovered signals; the LLM must be consulted exactly once")
        self.assertEqual(r.llm_calls, 1)

    def test_fully_covered_confident_turn_does_not_call_llm(self):
        r = self.turn("Chào bạn", llm=self.fake_llm({}))
        self.assertEqual(self.llm_seen, [])
        self.assertEqual(r.llm_calls, 0)

    def test_action_turn_never_calls_llm(self):
        r = self.eng.handle(ChatState(), Preferences(), action={"type": "search", "query": "phở"}, llm=self.fake_llm({}))
        self.assertEqual(self.llm_seen, [])
        self.assertEqual(r.llm_calls, 0)


if __name__ == "__main__":
    unittest.main()
