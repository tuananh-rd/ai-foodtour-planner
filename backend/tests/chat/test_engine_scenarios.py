"""Engine-level run of qa/chat/scenarios/scenarios.json (no HTTP). The API-level runner is qa/chat/run_scenarios.py.

`tour_ready` is produced by the API layer after planning, so the engine run treats `tour: present` as `plan_request`.
"""
import json
import unittest
from pathlib import Path

from app.chat.engine import ChatEngine
from app.chat.state import ChatState
from app.data import loader
from app.planner.relevance import fold_uncached
from app.planner.types import Preferences

ROOT = Path(__file__).resolve().parents[3]


def dig(obj, path):
    cur = obj
    for p in path.split("."):
        if isinstance(cur, list):
            cur = cur[int(p)] if p.isdigit() and int(p) < len(cur) else None
        elif isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
        if cur is None:
            return None
    return cur


def texts(blocks):
    out = []
    for b in blocks:
        for k in ("text", "question"):
            if b.get(k):
                out.append(b[k])
        for c in b.get("cards", []):
            out.append(c["venue"]["name"])
        for u in b.get("unsupported", []):
            out.append(u["text"])
        for w in b.get("warnings", []):
            out.append(w["text"])
    return fold_uncached(" ".join(out))


def run(only=None):
    data = loader.load_dataset((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve())
    eng = ChatEngine(data.venues)
    scenarios = json.load(open(ROOT / "qa/chat/scenarios/scenarios.json", encoding="utf-8"))["scenarios"]
    failures = []
    for s in scenarios:
        if only and s["id"] not in only:
            continue
        st, prefs = ChatState(), Preferences()
        area = (s["setup"].get("start") or {}).get("area")
        if area:
            r = eng.handle(st, prefs, action={"type": "set_location", "location": area})
            st, prefs = r.state, r.prefs
            st.turn_count = 0
        llm_stub = s["setup"].get("llm_stub", {})
        budget = s["setup"].get("budget", 20)
        for i, t in enumerate(s["turns"]):
            calls = [0]

            def llm(text, compact):
                if budget == 0 or text not in llm_stub:
                    return None
                calls[0] += 1
                return llm_stub[text]
            R = eng.handle(st, prefs, text=t.get("say"), action=t.get("action"),
                           llm=(llm if (s["setup"].get("llm") == "stub" and budget) else None),
                           llm_status=("exhausted" if (s["setup"].get("llm") == "stub" and not budget) else None))
            st, prefs = R.state, R.prefs
            errs = check(R, st, t["expect"])
            if errs:
                failures.append(f"{s['id']} #{i + 1}: {errs}")
    return failures


def check(R, st, e):
    sj = st.to_json()
    errs = []
    if 'intent' in e and R.intent != e['intent']:
        errs.append(f"intent {R.intent}!={e['intent']}")
    if 'tour' in e:
        has = bool(R.plan_request)
        if (e['tour'] == 'present') != has:
            errs.append(f"tour {has}")
    if 'llm_calls_max' in e and R.llm_calls > e['llm_calls_max']:
        errs.append(f"llm_calls {R.llm_calls}")
    if 'understanding' in e and R.understanding != e['understanding']:
        errs.append(f"understanding {R.understanding}")
    if 'pending_kind' in e:
        pk = st.pending.kind if st.pending else None
        if pk != e['pending_kind']:
            errs.append(f"pending {pk}!={e['pending_kind']}")
    types = [b['type'] for b in R.blocks]
    for bt in e.get('blocks_include', []):
        if bt not in types:
            errs.append(f"missing block {bt} in {types}")
    for bt in e.get('blocks_exclude', []):
        if bt in types:
            errs.append(f"unexpected block {bt}")
    tx = texts(R.blocks)
    for sub in e.get('text_contains', []):
        if fold_uncached(sub) not in tx:
            errs.append(f"text missing '{sub}'")
    for sub in e.get('text_not_contains', []):
        if fold_uncached(sub) in tx:
            errs.append(f"text has '{sub}'")
    for path, val in e.get('state', {}).items():
        got = dig(sj, path)
        if got != val:
            errs.append(f"state {path}={got!r}!={val!r}")
    for path in e.get('state_absent', []):
        if dig(sj, path) not in (None, [], {}):
            errs.append(f"state_absent {path}={dig(sj, path)!r}")
    cards = [c for b in R.blocks if b['type'] == 'venue_cards' for c in b['cards']]
    if 'cards' in e:
        if len(cards) < e['cards'].get('min', 0) or len(cards) > e['cards'].get('max', 99):
            errs.append(f"cards {len(cards)}")
    for fl in e.get('card_flags_all', []):
        if any(fl not in [f['code'] for f in c['flags']] for c in cards):
            errs.append(f"card flag {fl} missing")
    for sub in e.get('no_card_name_contains', []):
        if any(sub.lower() in c['venue']['name'].lower() for c in cards):
            errs.append(f"card name has {sub}")
    for lab in e.get('label_refs', []):
        if lab not in [x['label'] for x in st.last_results]:
            errs.append(f"label {lab} missing")
    cmp_ = next((b for b in R.blocks if b['type'] == 'compare_table'), None)
    if 'compare' in e:
        ce = e['compare']
        ids = [c['id'] for c in cmp_['criteria']] if cmp_ else []
        for c in ce.get('criteria', []):
            if c not in ids:
                errs.append(f"compare crit {c} not in {ids}")
        un = [u['criterion'] for b in R.blocks for u in b.get('unsupported', [])] + [b.get('code') for b in R.blocks if b.get('code') == 'criterion_unsupported']
        if ce.get('unsupported') and not un:
            errs.append('no unsupported')
        for c, status in ce.get('status', {}).items():
            row = next((r for r in (cmp_ or {}).get('rows', []) if r['criterion_id'] == c), None)
            if not row or any(cell['status'] != status for cell in row['cells']):
                errs.append(f"compare status {c}")
    return errs


class EngineScenarios(unittest.TestCase):
    def test_all_scenarios(self):
        failures = [f for f in run() if "tour_ready" not in f]
        self.assertEqual(failures, [])


if __name__ == "__main__":
    unittest.main()
