"""U1: durable safety obligations and slot extraction beyond S0 (guided engine, contract v1.9)."""
import unittest
from pathlib import Path

from app.chat.engine import ChatEngine
from app.chat.state import ChatState, Field_, Pending, ShortItem
from app.data import loader
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]
ALLERGY_CUE = "Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn"


def engine(guided=True):
    data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
    return ChatEngine(data.venues, guided=guided), data.venues


class Obligations(unittest.TestCase):
    def setUp(self):
        self.eng, self.venues = engine()

    def ready_state(self, **over):
        """A session that would be ready to plan: area, duration, vehicle, one shortlisted venue."""
        st = ChatState()
        st.set_field("area", {"kind": "district", "label": "Hoàn Kiếm", "lat": 21.0285, "lon": 105.8522, "district": "Hoàn Kiếm"})
        st.set_field("duration_min", 180)
        st.set_field("vehicle", "walk")
        st.shortlist.append(ShortItem(self.venues[0].id))
        for k, v in over.items():
            setattr(st, k, v)
        return st

    def drive(self, st, steps):
        pr, out = Preferences(), []
        for a in steps:
            r = self.eng.handle(st, pr, **({"action": a} if isinstance(a, dict) else {"text": a}))
            st, pr = r.state, r.prefs
            out.append(r)
        return out

    def test_unresolved_allergy_survives_edit_request_and_confirm(self):
        """Codex U0 finding 1: edit_profile -> request_plan -> confirm_yes must never authorise the planner."""
        st = self.ready_state(allergy_unresolved=True)
        st.pending = Pending("seed", "clarify_slot", [{"option_id": "allergy:peanut", "label": "Đậu phộng"}], "allergy_term", {})
        rs = self.drive(st, [{"type": "edit_profile", "patch": {"party_size": 2}}, {"type": "request_plan"}, {"type": "confirm_yes"}])
        self.assertTrue(all(r.plan_request is None for r in rs), [r.plan_request for r in rs])
        self.assertTrue(rs[-1].state.allergy_unresolved)
        self.assertEqual(rs[-1].state.pending.slot, "allergy_term")

    def test_resolving_the_allergy_unblocks_planning_only_after_confirmation(self):
        st = self.ready_state(allergy_unresolved=True)
        rs = self.drive(st, [{"type": "request_plan"}])
        self.assertEqual(rs[0].state.pending.slot, "allergy_term")
        rs += self.drive(rs[-1].state, [{"type": "pick_option", "option_id": "allergy:seafood"}])
        self.assertFalse(rs[-1].state.allergy_unresolved)
        self.assertIsNone(rs[-1].plan_request)
        rs += self.drive(rs[-1].state, [{"type": "request_plan"}])
        pend = rs[-1].state.pending
        if pend and pend.kind != "confirm_plan":  # budget scope may still be open; answer until the summary shows
            self.fail(f"unexpected question {pend.slot}")
        rs += self.drive(rs[-1].state, [{"type": "confirm_yes"}])
        self.assertTrue(rs[-1].plan_request)

    def test_stale_confirm_plan_cannot_plan_when_allergy_becomes_unresolved(self):
        st = self.ready_state()
        rs = self.drive(st, [{"type": "request_plan"}])
        self.assertEqual(rs[0].state.pending.kind, "confirm_plan")
        s2 = rs[0].state
        s2.allergy_unresolved = True  # e.g. set by a later message in another request
        rs2 = self.drive(s2, [{"type": "confirm_yes"}])
        self.assertIsNone(rs2[0].plan_request)
        self.assertEqual(rs2[0].state.pending.slot, "allergy_term")

    def test_budget_scope_obligation_survives_party_change(self):
        st = self.ready_state()
        st.set_field("budget", 500000, "user_said", None)
        st.set_field("party_size", 2)
        rs = self.drive(st, [{"type": "request_plan"}, {"type": "confirm_yes"}])
        self.assertTrue(all(r.plan_request is None for r in rs))
        self.assertEqual(rs[-1].state.pending.slot, "budget_scope")

    def test_obligation_round_trips_through_persistence(self):
        r = self.drive(ChatState(), [ALLERGY_CUE])[0]
        self.assertTrue(r.state.allergy_unresolved)
        back = ChatState.from_json(r.state.to_json(private=True))
        self.assertTrue(back.allergy_unresolved)
        self.assertEqual(back.pending.slot, "allergy_term")
        old = r.state.to_json(private=True)
        old.pop("allergy_unresolved")
        self.assertFalse(ChatState.from_json(old).allergy_unresolved)  # old rows load with defaults

    def test_explicit_no_allergy_clears(self):
        r = self.drive(ChatState(), [ALLERGY_CUE, "mình không bị dị ứng gì cả"])[-1]
        self.assertFalse(r.state.allergy_unresolved)

    def test_typed_substance_resolves(self):
        r = self.drive(ChatState(), [ALLERGY_CUE, "tôm"])[-1]
        self.assertFalse(r.state.allergy_unresolved)
        self.assertIn("tôm", " ".join(a.term for a in r.state.allergies))

    def test_flag_off_engine_never_sets_obligations(self):
        eng, _ = engine(guided=False)
        r = eng.handle(ChatState(), Preferences(), text=ALLERGY_CUE)
        self.assertFalse(r.state.allergy_unresolved)
        self.assertEqual(r.coverage, [])

    def test_day_part_does_not_override_explicit_meal_or_start_time(self):
        st = ChatState()
        st.set_field("start_time", "17:30", "ui_form")
        r = self.eng.handle(st, Preferences(meal="lunch"), text="Tối nay mình muốn ăn tour 3 quán quanh Hồ Gươm")
        self.assertEqual(r.state.profile["start_time"].value, "17:30")
        self.assertEqual(r.prefs.meal, "lunch")
        self.assertEqual(r.state.profile["day_part"].value, "evening")


class Slots(unittest.TestCase):
    def setUp(self):
        self.eng, _ = engine()

    def turn(self, text):
        return self.eng.handle(ChatState(), Preferences(), text=text)

    def test_leg_time_is_not_total_duration(self):
        r = self.turn("Tour quanh Hồ Gươm 120 phút, không đi bộ quá 10 phút mỗi chặng")
        self.assertEqual(r.state.profile["duration_min"].value, 120)
        self.assertEqual(r.state.profile["max_leg_min"].value, 10)

    def test_stops_out_of_range_is_rejected_not_clamped(self):
        r = self.turn("Mình muốn ăn tour 8 quán quanh Hồ Gươm")
        self.assertFalse(r.state.profile["stops"].known())
        self.assertTrue([b for b in r.blocks if b.get("code") == "value_rejected"])

    def test_number_words_and_part_of_day(self):
        r = self.turn("Chiều mai mình muốn ăn tour ba quán quanh Hồ Gươm")
        self.assertEqual(r.state.profile["stops"].value, 3)
        self.assertEqual(r.state.profile["day_part"].value, "afternoon")
        self.assertFalse(r.state.profile["start_time"].known())

    def test_search_with_a_count_is_not_a_tour_size(self):
        r = self.turn("Tìm 3 quán phở gần Hồ Gươm")
        self.assertFalse(r.state.profile["stops"].known())

    def test_hypothetical_and_quoted_dishes_and_allergies_do_not_act(self):
        r = self.turn('Giả sử tôi thích phở và dị ứng đậu phộng thì sao')
        self.assertFalse(r.state.allergies)
        self.assertFalse(r.state.profile["tastes"].known())

    def test_likes_ignore_non_food_phrases(self):
        r = self.turn("Mình thích đi bộ ngắm hồ, muốn ăn tour 2 quán quanh Hồ Gươm")
        self.assertFalse(r.state.profile["tastes"].known())

    def test_dislike_never_becomes_interest(self):
        r = self.turn("Tour 3 quán quanh Hồ Gươm, mình không thích bún")
        self.assertNotIn("bún", " ".join(r.state.profile["tastes"].value or []))


if __name__ == "__main__":
    unittest.main()


class LLMMerge(unittest.TestCase):
    """U2: the LLM may add what rules missed; it never records an allergy itself and never wins a numeric disagreement."""

    TEXT = "Tour 2 quán quanh Hồ Gươm tối nay cho 2 người, mình dị ứng mấy thứ rang giòn"

    def setUp(self):
        self.eng, _ = engine()
        self.calls = 0

    def fake(self, data):
        from app.chat.llm_understand import Outcome, sanitize

        def call(text, compact, used):
            self.calls += 1
            return Outcome(sanitize(data), 1)
        return call

    def test_llm_only_allergy_is_unconfirmed_and_blocks_until_confirmed(self):
        llm = self.fake({"intent": "SET_ALLERGY", "patch": {"allergy": ["đậu phộng"]}})
        r = self.eng.handle(ChatState(), Preferences(), text=self.TEXT, llm=llm)
        self.assertEqual(self.calls, 1)
        self.assertEqual(r.trigger_reason, "uncovered")
        self.assertEqual([a.source for a in r.state.allergies], ["ai_unconfirmed"])
        self.assertEqual(r.state.pending.slot, "allergy_confirm")
        self.assertEqual(len([b for b in r.blocks if b["type"] == "clarify"]), 1)
        card = [b for b in r.blocks if b["type"] == "understood"][0]
        self.assertEqual(card["allergies"][0]["status"], "ai_unconfirmed")
        r = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": "allergy_ok"})
        self.assertEqual([a.source for a in r.state.allergies], ["user_said"])
        self.assertFalse(r.state.allergy_unresolved)
        self.assertIsNone(r.plan_request)

    def test_declined_ai_allergy_is_removed_and_asks_for_a_concrete_one(self):
        llm = self.fake({"intent": "SET_ALLERGY", "patch": {"allergy": ["tôm"]}})
        r = self.eng.handle(ChatState(), Preferences(), text=self.TEXT, llm=llm)
        r = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": "allergy_no"})
        self.assertEqual(r.state.allergies, [])
        self.assertTrue(r.state.allergy_unresolved)  # the cue is still unresolved: planning stays blocked

    def test_numeric_disagreement_is_asked_not_picked(self):
        llm = self.fake({"intent": "SET_ALLERGY", "patch": {"allergy": ["lạc"], "party_size": 4}})
        r = self.eng.handle(ChatState(), Preferences(), text=self.TEXT, llm=llm)
        self.assertEqual(r.trigger_reason, "conflict")
        self.assertEqual(r.state.pending.slot, "allergy_confirm")  # safety first; the disagreement is queued, not lost
        self.assertEqual(r.state.conflicts[0]["key"], "party_size")
        self.assertFalse(r.state.profile["party_size"].known())
        r = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": "allergy_ok"})
        self.assertEqual(r.state.pending.slot, "conflict")
        r = self.eng.handle(r.state, r.prefs, action={"type": "pick_option", "option_id": "conflict:0"})
        self.assertEqual(r.state.profile["party_size"].value, 2)

    def test_llm_fills_a_slot_rules_missed_and_disagreement_is_asked(self):
        llm = self.fake({"intent": "UPDATE_PROFILE", "patch": {"interests": ["bún chả"], "stops": 5}})
        r = self.eng.handle(ChatState(), Preferences(), text=self.TEXT, llm=llm)
        self.assertIn("bún chả", r.state.profile["tastes"].value or [])
        self.assertNotEqual(r.state.profile["stops"].value, 5)
        keys = [c["key"] for c in r.state.conflicts] + ([r.state.pending.context.get("key")] if r.state.pending else [])
        self.assertIn("stops", keys)

    def test_sanitize_new_fields(self):
        from app.chat.llm_understand import sanitize
        out = sanitize({"intent": "UPDATE_PROFILE", "patch": {"stops": 9, "day_part": "evening", "interests": ["phở", "<b>x</b>", "a b c d e"]}})
        self.assertNotIn("stops", out["patch"])
        self.assertEqual(out["patch"]["day_part"], "evening")
        items = out["patch"]["interests"]
        self.assertIn("phở", items)
        self.assertTrue(all("<" not in i and len(i.split()) <= 3 for i in items), items)
        self.assertEqual(sanitize({"intent": "UPDATE_PROFILE", "patch": {"day_part": "midnight"}})["patch"], {})

    def test_no_llm_call_when_rules_cover_everything(self):
        r = self.eng.handle(ChatState(), Preferences(), text="Tour 3 quán quanh Hồ Gươm tối nay 120 phút cho 2 người, mình thích phở", llm=self.fake({"intent": "UPDATE_PROFILE"}))
        self.assertEqual(self.calls, 0)
        self.assertIsNone(r.trigger_reason)
