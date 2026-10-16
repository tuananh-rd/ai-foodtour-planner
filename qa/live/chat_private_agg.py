"""Aggregate-only run of chat v2 over the private dataset (FOODTOUR_DATA_PATH). Prints counts/latencies, never rows.

Usage: FOODTOUR_DATA_PATH=<absolute csv> PYTHONPATH=backend python qa/live/chat_private_agg.py
Conversations are scripted (dish x district) and go through ChatEngine directly (no HTTP, no providers).
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.chat.engine import ChatEngine  # noqa: E402
from app.chat.gazetteer import Gazetteer  # noqa: E402
from app.chat.planning import plan_selected  # noqa: E402
from app.chat.state import ChatState  # noqa: E402
from app.data import loader  # noqa: E402
from app.planner.interfaces import StraightLineEstimator  # noqa: E402
from app.planner.types import Preferences  # noqa: E402

DISHES = ["phở", "bún chả", "bún", "bánh mì", "chè", "cà phê", "lẩu", "nem", "ốc", "cơm"]
DISTRICTS = ["Hoàn Kiếm", "Cầu Giấy", "Đống Đa", "Hai Bà Trưng"]


def pct(xs, q):
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * len(xs)))] * 1000, 1) if xs else None


def main() -> int:
    path = os.environ.get("FOODTOUR_DATA_PATH", "").strip()
    if not path:
        print("FOODTOUR_DATA_PATH not set; nothing run.")
        return 2
    data = loader.load_dataset(Path(path))
    gz = Gazetteer(data.venues)
    eng = ChatEngine(data.venues, gz)
    by = {v.id: v for v in data.venues}
    lat = {"search": [], "compare": [], "add": [], "allergy_search": [], "plan_summary": [], "plan": []}
    zero, total, flags, cards_n = 0, 0, Counter(), 0
    unknown_hours = unknown_price = few_rev = 0
    errors = 0
    plans = Counter()
    for dish in DISHES:
        for dist in DISTRICTS:
            st, pr = ChatState(), Preferences()
            try:
                def step(name, **kw):
                    nonlocal st, pr
                    t = time.perf_counter()
                    r = eng.handle(st, pr, **kw)
                    lat[name].append(time.perf_counter() - t)
                    st, pr = r.state, r.prefs
                    return r
                step("search", action={"type": "set_location", "location": {"district": dist}})
                r = step("search", text=f"tìm quán {dish}")
                cards = [c for b in r.blocks if b["type"] == "venue_cards" for c in b["cards"]]
                total += 1
                zero += not cards
                cards_n += len(cards)
                for c in cards:
                    for f in c["flags"]:
                        flags[f["code"]] += 1
                    unknown_hours += c["venue"]["hours"] is None
                    unknown_price += c["venue"]["price"] is None
                    few_rev += any(f["code"] == "few_reviews" for f in c["flags"])
                if len(cards) >= 2:
                    step("compare", text="so sánh A và B")
                    step("add", text="Thêm A")
                    step("add", text="Thêm B")
                    step("plan_summary", text="tạo lịch đi")
                    r = step("plan_summary", text="16 giờ đến 19 giờ, đi bộ")
                    if r.state.pending and r.state.pending.kind == "confirm_plan":
                        t = time.perf_counter()
                        r = eng.handle(st, pr, action={"type": "confirm_yes"})
                        st, pr = r.state, r.prefs
                        if r.plan_request:
                            tour = plan_selected(by, r.plan_request["venue_ids"], pr, StraightLineEstimator(), st.profile["vehicle"].value)
                            plans[tour.status] += 1
                        lat["plan"].append(time.perf_counter() - t)
                st2, pr2 = ChatState(), Preferences()
                r = eng.handle(st2, pr2, action={"type": "set_location", "location": {"district": dist}})
                r = eng.handle(r.state, r.prefs, text="dị ứng cua")
                t = time.perf_counter()
                r = eng.handle(r.state, r.prefs, text=f"tìm quán {dish}")
                lat["allergy_search"].append(time.perf_counter() - t)
            except Exception:
                errors += 1
    out = {"dataset_rows": len(data.venues), "conversations": total, "searches_with_zero_results": zero, "cards_total": cards_n,
           "flag_counts": dict(flags), "cards_hours_missing": unknown_hours, "cards_price_missing": unknown_price, "cards_few_reviews": few_rev,
           "plan_status": dict(plans), "errors": errors,
           "latency_ms": {k: {"n": len(v), "p50": pct(v, 0.5), "p95": pct(v, 0.95)} for k, v in lat.items()}}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
