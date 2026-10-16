"""Generate contracts/fixtures/chat_turns.synthetic.json from the real engine (synthetic data only).

Each entry is a recorded turn: the request body and the `reply` / `chat` / `turn` parts of the contract v1.8 response
(SessionView fields are omitted). Frontend work can render these before /chat is wired.
Run: python tools/gen_chat_turns.py   (PYTHONPATH=backend)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.chat.engine import ChatEngine  # noqa: E402
from app.chat.state import ChatState  # noqa: E402
from app.data import loader  # noqa: E402
from app.planner.types import Preferences  # noqa: E402

SCRIPT = [
    ("discover_no_location", [("text", "Chiều nay nóng quá, quanh đây ăn gì được?"), ("action", {"type": "set_location", "location": {"district": "Cầu Giấy"}})]),
    ("search_compare_add", [("action", {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}), ("text", "tìm quán bún quanh Hoàn Kiếm"),
                            ("text", "So sánh A và B, chỗ nào gần hơn?"), ("text", "Thêm A")]),
    ("allergy_flow", [("action", {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}), ("text", "có bạn không ăn cua"), ("text", "dị ứng"),
                      ("text", "tìm quán chè")]),
    ("plan_confirm", [("action", {"type": "set_location", "location": {"district": "Hoàn Kiếm"}}), ("text", "tìm quán chè gần đây"), ("text", "Thêm A"),
                      ("text", "tạo lịch đi"), ("text", "16 giờ đến 18 giờ, đi bộ")]),
    ("ambiguous_ok", [("text", "ok")]),
]


def main():
    data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
    eng = ChatEngine(data.venues)
    out = {"_label": "SYNTHETIC recorded chat turns (engine output; contract v1.8)", "synthetic": True, "conversations": []}
    for name, steps in SCRIPT:
        st, prefs, turns = ChatState(), Preferences(), []
        for kind, payload in steps:
            r = eng.handle(st, prefs, text=payload if kind == "text" else None, action=payload if kind == "action" else None)
            st, prefs = r.state, r.prefs
            req = {"text": payload, "action": None} if kind == "text" else {"text": None, "action": payload}
            turns.append({"request": req, "response": {"reply": {"blocks": r.blocks}, "chat": st.to_json(),
                                                       "turn": {"intent": r.intent, "tools": r.tools, "understanding": r.understanding},
                                                       "llm_calls": r.llm_calls, "plan_request": bool(r.plan_request)}})
        out["conversations"].append({"name": name, "turns": turns})
    path = ROOT / "contracts" / "fixtures" / "chat_turns.synthetic.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", path, sum(len(c["turns"]) for c in out["conversations"]), "turns")


if __name__ == "__main__":
    main()
