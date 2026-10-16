import json
import unittest
from pathlib import Path

from app.chat.engine import ChatEngine
from app.chat.llm_understand import LLMUnderstander, Outcome, response_schema, sanitize
from app.chat.state import ChatState
from app.data import loader
from app.llm.provider import ProviderError
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]


class Budget:
    def __init__(self, remaining=10, exhausted=False):
        self.remaining, self.exhausted = remaining, exhausted

    def snapshot(self):
        return {"remaining": self.remaining, "exhausted": self.exhausted, "limit": 20, "used": 20 - self.remaining}


class Provider:
    def __init__(self, answer=None, error=None):
        self.answer, self.error, self.calls, self.seen = answer, error, 0, []

    def understand(self, text, compact, *, deadline_s):
        self.calls += 1
        self.seen.append((text, compact))
        if self.error:
            raise self.error
        return self.answer


class Sanitize(unittest.TestCase):
    def test_whitelist_and_ranges(self):
        raw = {"intent": "UPDATE_PROFILE", "refs": ["A", "ignore", "7", "last"],
               "patch": {"party_size": 4, "budget_vnd": -5, "vehicle": "rocket", "audience": "family", "start_time": "25:00",
                         "end_time": "18:30", "taste": "ít <b>ngọt</b>", "admin": True, "criteria": ["distance", "x"],
                         "allergy": ["cua", "a very long unknown allergen name here", "tôm"]}}
        out = sanitize(raw)
        self.assertEqual(out["intent"], "UPDATE_PROFILE")
        self.assertEqual(out["refs"], ["A", "last"])
        p = out["patch"]
        self.assertEqual((p["party_size"], p["audience"], p["end_time"], p["criteria"]), (4, "family", "18:30", ["distance"]))
        for bad in ("budget_vnd", "vehicle", "start_time", "admin"):
            self.assertNotIn(bad, p)
        self.assertNotIn("<", p["taste"])
        self.assertEqual(p["allergy"], ["cua", "tôm"])

    def test_unknown_intent_is_rejected(self):
        for raw in ({"intent": "DELETE_EVERYTHING"}, {"intent": "UNKNOWN"}, {}, None, "x"):
            self.assertIsNone(sanitize(raw))

    def test_schema_has_closed_intents(self):
        self.assertNotIn("UNKNOWN", response_schema()["properties"]["intent"]["enum"])


class Gate(unittest.TestCase):
    def make(self, provider, budget=None, **kw):
        return LLMUnderstander(provider, budget or Budget(), **kw)

    def test_call_is_counted_and_cached(self):
        pr = Provider({"intent": "SEARCH_VENUES", "patch": {"dish": "phở"}})
        u = self.make(pr)
        a = u.understand("tìm gì đó", {"phase": "discover"})
        b = u.understand("tìm gì đó", {"phase": "discover"})
        self.assertEqual((a.calls, a.status, b.calls, pr.calls), (1, None, 0, 1))
        self.assertEqual(b.data["intent"], "SEARCH_VENUES")

    def test_session_cap_and_reserve_refuse_without_calling(self):
        pr = Provider({"intent": "SEARCH_VENUES"})
        self.assertEqual(self.make(pr, session_cap=2).understand("x", {}, used_in_session=2).status, "capped")
        self.assertEqual(self.make(pr, Budget(remaining=3), reserve=3).understand("x", {}).status, "exhausted")
        self.assertEqual(self.make(pr, Budget(remaining=0, exhausted=True)).understand("x", {}).status, "exhausted")
        self.assertEqual(pr.calls, 0)

    def test_provider_failure_still_counts_when_attempted(self):
        out = self.make(Provider(error=ProviderError("timeout"))).understand("x", {})
        self.assertEqual((out.data, out.calls, out.status), (None, 1, "error"))
        refused = ProviderError("quota")
        refused.llm_calls = 0
        out = self.make(Provider(error=refused)).understand("y", {})
        self.assertEqual((out.calls, out.status), (0, "exhausted"))

    def test_bad_model_json_counts_one_call_and_yields_nothing(self):
        out = self.make(Provider({"intent": "NOPE"})).understand("x", {})
        self.assertEqual((out.data, out.calls), (None, 1))

    def test_prompt_input_is_name_free(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        eng = ChatEngine(data.venues)
        r = eng.handle(ChatState(), Preferences(), action={"type": "set_location", "location": {"district": "Hoàn Kiếm"}})
        r = eng.handle(r.state, r.prefs, text="tìm quán phở")
        compact = eng.compact(r.state)
        blob = json.dumps(compact, ensure_ascii=False)
        for forbidden in ("SYNTHETIC", "Hoàn Kiếm", "lat", "lon", "address", "Phở Thử"):
            self.assertNotIn(forbidden, blob)


class EngineWithLLM(unittest.TestCase):
    def setUp(self):
        data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
        self.eng = ChatEngine(data.venues)
        loc = self.eng.handle(ChatState(), Preferences(), action={"type": "set_location", "location": {"district": "Hoàn Kiếm"}})
        self.st, self.pr = loc.state, loc.prefs

    def llm(self, answer, calls=1, status=None):
        return lambda text, compact, used: Outcome(sanitize(answer, self.eng.gz), calls, status)

    def test_low_confidence_text_uses_llm_once(self):
        text = "thay vì ba người thì bốn mà bỏ cua đi nhé, tìm chỗ nào mát mát"
        r = self.eng.handle(self.st, self.pr, text=text, llm=self.llm({"intent": "SET_ALLERGY", "patch": {"party_size": 4, "allergy": ["cua"]}}))
        self.assertEqual((r.understanding, r.llm_calls, r.intent), ("llm", 1, "SET_ALLERGY"))
        self.assertEqual([a.term for a in r.state.allergies], ["cua"])
        self.assertEqual(r.state.llm_used, 1)

    def test_confident_rules_never_call_llm(self):
        called = []
        r = self.eng.handle(self.st, self.pr, text="tìm quán phở", llm=lambda *a: called.append(1) or Outcome(None, 1))
        self.assertEqual((called, r.llm_calls, r.understanding), ([], 0, "rules"))

    def test_llm_cannot_guess_an_allergy_without_a_term(self):
        r = self.eng.handle(self.st, self.pr, text="thay vì ba người thì bốn mà bỏ cua đi nhé, tìm chỗ nào mát mát",
                            llm=self.llm({"intent": "SET_ALLERGY", "patch": {}}))
        self.assertEqual(r.state.allergies, [])
        self.assertNotEqual(r.understanding, "llm")

    def test_llm_unsafe_is_honoured_and_confirm_yes_needs_pending(self):
        text = "thay vì ba người thì bốn mà bỏ cua đi nhé, tìm chỗ nào mát mát"
        r = self.eng.handle(self.st, self.pr, text=text, llm=self.llm({"intent": "UNSAFE"}))
        self.assertEqual(r.intent, "UNSAFE")
        r = self.eng.handle(self.st, self.pr, text=text, llm=self.llm({"intent": "CONFIRM_YES"}))
        self.assertIsNone(r.plan_request)  # no confirm_plan pending => never plans

    def test_llm_failure_degrades_to_clarification_with_reason(self):
        text = "thay vì ba người thì bốn mà bỏ cua đi nhé, tìm chỗ nào mát mát"
        r = self.eng.handle(self.st, self.pr, text=text, llm=lambda *a: Outcome(None, 0, "exhausted"))
        body = " ".join(b.get("text", "") for b in r.blocks)
        self.assertIn("AI hết lượt", body)
        self.assertEqual(r.state.pending.kind, "clarify_intent")


if __name__ == "__main__":
    unittest.main()
