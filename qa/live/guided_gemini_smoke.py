"""LIVE Gemini smoke for the GUIDED engine (U-series). Makes REAL calls: at most --max-calls (default 6) across the run.

Series budget: the whole U-series may spend 8 live calls; this script is the only caller. Every call goes through the
same persisted daily ledger as the app when FOODTOUR_BUDGET_DB / FOODTOUR_SESSION_DB is configured (otherwise the budget
is in memory and this script says so). Synthetic sentences only; prints aggregates and never the key.
Usage (repo root):   PYTHONPATH=backend python qa/live/guided_gemini_smoke.py [--max-calls 6]
Exit 0 only when every safety invariant holds: no plan, an LLM-sourced allergy is never recorded as the user's word
(ai_unconfirmed + confirmation question), controls (fully covered sentences) make 0 calls, <=1 call per turn.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import load_local_env  # noqa: E402

load_local_env()

from app.chat.engine import ChatEngine  # noqa: E402
from app.chat.gazetteer import Gazetteer  # noqa: E402
from app.chat.llm_understand import GeminiUnderstandingProvider, LLMUnderstander  # noqa: E402
from app.chat.state import ChatState  # noqa: E402
from app.data import loader  # noqa: E402
from app.planner.types import Preferences  # noqa: E402

S0 = ("Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. "
      "Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.")
# (id, sentence, expect_call)  expect_call: True = the coverage audit should consult Gemini, False = control (rules cover it)
CASES = [
    ("hat", "Con mình bé xíu, bị dị ứng mấy loại hạt, tối nay muốn ăn tour 2 quán quanh Hồ Gươm", True),
    ("vo_cung", "Mình dị ứng đồ có vỏ cứng, đi tour 3 quán quanh Hồ Gươm tối nay", True),
    ("do_bien", "Bạn đi cùng dị ứng nặng với mấy món biển, ăn tour 3 quán quanh Hồ Gươm", True),
    ("khong_nho_ten", "Mình bị dị ứng nhưng không nhớ tên, chỉ biết ăn vào là ngứa họng, tour 2 quán quanh Hồ Gươm", True),
    ("control_s0", S0, False),
    ("control_covered", "Tối nay mình ăn tour 3 quán quanh Hồ Gươm, ngân sách 500k cho cả nhóm 4 người, dị ứng đậu phộng", False),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, default=6)
    ap.add_argument("--only", default="", help="comma-separated case ids to run (saves live calls)")
    args = ap.parse_args()
    provider = GeminiUnderstandingProvider()
    if not provider.configured:
        print("Gemini is not configured (GEMINI_API_KEY missing); nothing was called.")
        return 2
    errors = []
    inner = provider.understand

    def traced(text, compact, *, deadline_s):
        try:
            return inner(text, compact, deadline_s=deadline_s)
        except Exception as e:  # only the error kind/status is kept, never payloads or keys
            errors.append({"kind": getattr(e, "kind", type(e).__name__), "status": getattr(e, "status", None)})
            raise
    provider.understand = traced
    budget = provider.client.budget
    before = budget.snapshot()
    data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
    und = LLMUnderstander(provider, budget, session_cap=args.max_calls, reserve=3, gazetteer=Gazetteer(data.venues))
    eng = ChatEngine(data.venues, guided=True)
    rows, bad, spent = [], [], 0
    wanted = {x for x in args.only.split(",") if x}
    for cid, text, expect_call in CASES:
        if wanted and cid not in wanted:
            continue
        r = eng.handle(ChatState(), Preferences(), text=text, llm=lambda t, c, u: und.understand(t, c, used_in_session=0)
                       if spent < args.max_calls else und.understand(t, c, used_in_session=args.max_calls))
        spent += r.llm_calls
        srcs = [(a.term, a.source) for a in r.state.allergies]
        row = {"id": cid, "calls": r.llm_calls, "trigger": r.trigger_reason, "understanding": r.understanding,
               "allergies": srcs, "pending": getattr(r.state.pending, "slot", None), "unresolved": r.state.allergy_unresolved,
               "plan": bool(r.plan_request), "notice": [b.get("code") for b in r.blocks if b["type"] == "notice"]}
        rows.append(row)
        if r.plan_request:
            bad.append((cid, "planned"))
        if r.llm_calls > 1:
            bad.append((cid, "more than one call"))
        if any(src == "user_said" for term, src in srcs) and r.llm_calls and not expect_call:
            bad.append((cid, "control used the LLM"))
        if not expect_call and r.llm_calls:
            bad.append((cid, "control consumed a call"))
        if expect_call and r.llm_calls and any(src == "user_said" for _t, src in srcs) and r.understanding in ("llm", "cache"):
            bad.append((cid, "LLM allergy recorded as user_said"))
        if expect_call and not srcs and not r.state.allergy_unresolved:
            bad.append((cid, "allergy cue silently dropped"))
        if spent > args.max_calls:
            bad.append((cid, "budget exceeded"))
            break
    after = budget.snapshot()
    print(json.dumps({"calls": spent, "budget_before": {k: before[k] for k in ("limit", "used", "remaining")},
                      "budget_after": {k: after[k] for k in ("limit", "used", "remaining")},
                      "errors": errors, "violations": bad, "rows": rows}, ensure_ascii=False, indent=1))
    return 0 if not bad and spent <= args.max_calls else 1


if __name__ == "__main__":
    raise SystemExit(main())
