"""Generate contracts/fixtures/chat_turns.guided.synthetic.json: recorded GUIDED conversations (contract v1.9.1).

Engine output on the synthetic dataset only; `turn` carries trigger_reason / coverage / llm_calls exactly as the API will
(the API adds turn.llm_budget; top-level llm_budget is omitted in guided mode). Frontend work can render these
before the real /chat serves them.   Run: PYTHONPATH=backend python tools/gen_guided_turns.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.chat.engine import ChatEngine  # noqa: E402
from app.chat.llm_understand import Outcome, sanitize  # noqa: E402
from app.chat.state import ChatState  # noqa: E402
from app.data import loader  # noqa: E402
from app.planner.types import Preferences  # noqa: E402

S0 = ("Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. "
      "Tôi thích phở và bún chả, dị ứng đậu phộng. Hãy hỏi tôi nếu còn thiếu thông tin.")
CUE = "Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn"
pick = lambda oid: ("action", {"type": "pick_option", "option_id": oid})  # noqa: E731

SCRIPT = [
    ("s0_full_flow", None, [("text", S0), pick("scope:group"), ("text", "19h"), pick("veh:walk"), pick("propose:use"), pick("confirm_yes")]),
    ("allergy_chip", None, [("text", CUE), pick("allergy:peanut")]),
    ("allergy_from_gemini_unconfirmed", {"intent": "SET_ALLERGY", "patch": {"allergy": ["đậu phộng"]}}, [("text", CUE), pick("allergy_ok")]),
    ("conflict_queued", {"intent": "SET_ALLERGY", "patch": {"allergy": ["lạc"], "party_size": 4}},
     [("text", "Tour 2 quán quanh Hồ Gươm tối nay cho 2 người, mình dị ứng mấy thứ rang giòn"), pick("allergy_ok"), pick("conflict:0")]),
    ("no_gemini_budget_exhausted", "exhausted", [("text", CUE)]),
]


def main():
    data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
    eng = ChatEngine(data.venues, guided=True)
    out = {"_label": "SYNTHETIC recorded guided chat turns (engine output; contract v1.9.1)", "synthetic": True, "conversations": []}
    for name, llm_data, steps in SCRIPT:
        st, prefs, turns = ChatState(), Preferences(), []
        if llm_data == "exhausted":
            llm = lambda text, compact, used: Outcome(None, 0, "exhausted")  # noqa: E731
        elif llm_data:
            llm = lambda text, compact, used, d=llm_data: Outcome(sanitize(d), 1)  # noqa: E731
        else:
            llm = None
        for kind, payload in steps:
            r = eng.handle(st, prefs, text=payload if kind == "text" else None, action=payload if kind == "action" else None, llm=llm)
            st, prefs = r.state, r.prefs
            req = {"text": payload, "action": None} if kind == "text" else {"text": None, "action": payload}
            turns.append({"request": req, "response": {
                "reply": {"blocks": r.blocks}, "chat": st.to_json(),
                "turn": {"intent": r.intent, "tools": r.tools, "understanding": r.understanding, "trigger_reason": r.trigger_reason,
                         "coverage": {"signals": r.coverage, "complete": all(s["status"] == "captured" for s in r.coverage)},
                         "llm_calls": r.llm_calls},
                "plan_request": bool(r.plan_request)}})
        out["conversations"].append({"name": name, "turns": turns})
    path = ROOT / "contracts" / "fixtures" / "chat_turns.guided.synthetic.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", path, sum(len(c["turns"]) for c in out["conversations"]), "turns")


if __name__ == "__main__":
    main()
