"""In-process contract v1.8 acceptance runner. No external providers or private data."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
MISSING = object()
EXPECT_KEYS = set("intent understanding llm_calls_max tour phase pending_kind blocks_include blocks_exclude text_contains text_not_contains state state_absent cards card_flags_all no_card_name_contains compare no_repeat_of_previous_question label_refs status error_code".split())


class ChatUnavailable(RuntimeError):
    pass


class StubUnderstandingProvider:
    """C5 hook: app.state.chat_understanding_provider.understand(text, state).

    Exact text lookup, detached dict result, fail closed on unmapped calls.
    Budget admission belongs to the call site; calls counts even failed lookups.
    """
    def __init__(self, answers):
        self.answers = deepcopy(answers)
        self.calls = 0

    def understand(self, text, state):
        self.calls += 1
        if text not in self.answers:
            raise AssertionError("Unmapped stub understanding request")
        return deepcopy(self.answers[text])

    __call__ = understand


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", str(text).casefold().replace("đ", "d"))
                   if unicodedata.category(c) not in ("Mn", "Cf"))


def at(value, path, default=MISSING):
    for part in path.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
            value = value[int(part)]
        else:
            return default
    return value


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


@contextmanager
def scenario_app(setup):
    from app.main import create_app
    from app.repositories.llm_budget import DailyLLMBudget
    from fastapi.testclient import TestClient
    if setup.get("fixture", "chat") != "chat" or setup.get("llm", "off") not in ("off", "stub"):
        raise ValueError("Only synthetic chat fixture and off/stub providers are supported")
    with tempfile.TemporaryDirectory() as temp:
        env = {"FOODTOUR_CHAT_V2": "1", "FOODTOUR_DATA_PATH": str((ROOT / "contracts/fixtures/venues.chat.synthetic.json").resolve()),
               "FOODTOUR_SESSION_DB": str(Path(temp) / "sessions.sqlite"), "FOODTOUR_BUDGET_DB": str(Path(temp) / "budget.sqlite"),
               "FOODTOUR_LLM": setup.get("llm", "off"), "FOODTOUR_EXPLAIN": "template", "FOODTOUR_ROUTING": "estimate",
               "FOODTOUR_GEOCODER": "off", "FOODTOUR_RATE_LIMIT_TOKEN": "10000", "FOODTOUR_RATE_LIMIT_IP": "10000",
               "FOODTOUR_LLM_SESSION_CAP": "6", "FOODTOUR_LLM_RESERVE": "3"}
        budget = setup.get("budget")
        if budget is not None:
            env["FOODTOUR_LLM_DAILY_BUDGET"] = str(budget)
        with patch.dict(os.environ, env):
            app = create_app(data_path=env["FOODTOUR_DATA_PATH"])
            provider = StubUnderstandingProvider(setup.get("llm_stub", {}))
            app.state.chat_understanding_provider = provider if setup.get("llm") == "stub" else None
            app.state.llm_budget = DailyLLMBudget(budget if budget is not None else 18, db_path=env["FOODTOUR_BUDGET_DB"])
            with TestClient(app) as client:
                yield app, client, provider


def available(client, url, headers, revision):
    config = client.get("/v1/client-config")
    if config.status_code != 200:
        raise AssertionError(f"client-config returned {config.status_code}")
    if not config.json().get("features", {}).get("chat_v2"):
        raise ChatUnavailable("features.chat_v2 absent/disabled; /chat not implemented")
    # Invalid request probes route presence without mutating a session.
    probe = client.post(url + "/chat", headers=headers, json={"revision": revision})
    if probe.status_code == 404:
        raise ChatUnavailable("/chat returned 404; endpoint not implemented")
    if probe.status_code != 422:
        raise AssertionError(f"Invalid chat probe expected 422, got {probe.status_code}")


def evaluate(body, expect, *, status=200, previous=None, turn=None, history=None, actual_calls=0, fixture=None, confirmed=False):
    """Return all failures, including invariant failures even if no expect was supplied."""
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)
    unknown = set(expect) - EXPECT_KEYS
    check(not unknown, f"unknown expectation keys: {sorted(unknown)}")
    check(status == expect.get("status", 200), f"HTTP {status}, expected {expect.get('status', 200)}")
    if "error_code" in expect:
        check(at(body, "error.code") == expect["error_code"], "error.code mismatch")
    check(actual_calls <= 1, "provider called more than once")
    if "llm_calls_max" in expect:
        check(actual_calls <= expect["llm_calls_max"], "llm_calls_max exceeded")
    if status != 200:
        if previous is not None:
            check(body.get("tour") is None, "error response contains tour")
        return errors
    chat = body.get("chat", {})
    blocks = at(body, "reply.blocks", [])
    types = [b.get("type") for b in blocks]
    text = fold(" ".join(strings(blocks)))
    cards = [c for b in blocks if b.get("type") == "venue_cards" for c in b.get("cards", [])]
    for key, path in (("intent", "turn.intent"), ("understanding", "turn.understanding"), ("phase", "chat.phase")):
        if key in expect:
            check(at(body, path) == expect[key], f"{path}: {at(body, path)!r} != {expect[key]!r}")
    if "pending_kind" in expect:
        check(at(chat, "pending.kind", None) == expect["pending_kind"], "pending kind mismatch")
    reported_calls = body.get("llm_calls")
    check(type(reported_calls) is int and 0 <= reported_calls <= 1, "llm_calls missing or outside 0..1")
    check(reported_calls == actual_calls, f"reported calls {reported_calls} != observed {actual_calls}")
    if "llm_calls_max" in expect:
        check(actual_calls <= expect["llm_calls_max"], "llm_calls_max exceeded")
        check(type(reported_calls) is int and reported_calls <= expect["llm_calls_max"], "reported llm_calls_max exceeded")
    action = (turn or {}).get("action", {})
    if action:
        check(actual_calls == 0 and at(body, "turn.understanding") == "action", "action used understanding provider")
    if "tour" in expect:
        check((body.get("tour") is not None) == (expect["tour"] == "present"), "tour presence mismatch")
    if body.get("tour") is not None:
        check(confirmed, "tour without confirmed confirm_plan")
    for key, positive in (("blocks_include", True), ("blocks_exclude", False)):
        for typ in expect.get(key, []):
            check((typ in types) == positive, f"{key}: {typ}")
    for key, positive in (("text_contains", True), ("text_not_contains", False)):
        for phrase in expect.get(key, []):
            check((re.search(r"(?<!\w)" + re.escape(fold(phrase)) + r"(?!\w)", text) is not None) == positive, f"{key}: {phrase}")
    for path, wanted in expect.get("state", {}).items():
        check(at(chat, path) == wanted, f"chat.{path}: {at(chat, path)!r} != {wanted!r}")
    for path in expect.get("state_absent", []):
        check(at(chat, path) is MISSING or at(chat, path) is None, f"chat.{path} should be absent/null")
    for key, compare in (("min", lambda x, y: x >= y), ("max", lambda x, y: x <= y)):
        if key in expect.get("cards", {}):
            check(compare(len(cards), expect["cards"][key]), f"cards {key}: {len(cards)}")
    for flag in expect.get("card_flags_all", []):
        check(all(flag in [f.get("code") for f in c.get("flags", [])] for c in cards), f"card flag missing: {flag}")
    for phrase in expect.get("no_card_name_contains", []):
        check(all(fold(phrase) not in fold(at(c, "venue.name", "")) for c in cards), f"excluded card name: {phrase}")
    for label in expect.get("label_refs", []):
        check(label in [r.get("label") for r in chat.get("last_results", [])], f"missing label {label}")
    tables = [b for b in blocks if b.get("type") == "compare_table"]
    cmp = expect.get("compare", {})
    if cmp:
        check(bool(tables), "missing compare_table")
    for table in tables:
        if "criteria" in cmp:
            check([c["id"] for c in table.get("criteria", [])] == cmp["criteria"], "compare criteria mismatch")
        for crit in cmp.get("unsupported", []):
            check(crit in [u["criterion"] for u in table.get("unsupported", [])], f"unsupported criterion missing: {crit}")
        for crit, wanted in cmp.get("status", {}).items():
            rows = [r for r in table.get("rows", []) if r["criterion_id"] == crit]
            check(bool(rows) and all(c.get("status") == wanted for r in rows for c in r.get("cells", [])), f"compare status: {crit}")
        for row in table.get("rows", []):
            for cell in row.get("cells", []):
                if cell.get("status") == "unknown":
                    check(cell.get("value") is None or fold(cell.get("value")) == fold("Chưa rõ"), "invented unknown compare value")
    questions = [b.get("question", "") for b in blocks if b.get("type") == "clarify"]
    slot = at(chat, "pending.slot", None)
    slot_value = at(chat, f"profile.{slot}.value", None) if slot else None
    if expect.get("no_repeat_of_previous_question"):
        for old_slot, old_value, old_q in history or []:
            if old_slot == slot and old_value == slot_value:
                check(all(fold(q) != fold(old_q) for q in questions), "repeated question for unchanged slot")
    if history is not None:
        history.extend((slot, slot_value, q) for q in questions)
    # Dataset grounding on every card: unknown stays unknown, known facts match the fixture.
    venues = [(c.get("venue", {}), c) for c in cards]
    for stop in (body.get("tour") or {}).get("stops", []):
        if "venue" in stop:
            venues.append((stop["venue"], stop))
    for venue, container in venues:
        safe_text = fold(" ".join(strings(container)))
        check(not re.search(r"\b(safe|an toan)\b", safe_text), "card/venue contains allergy safety claim")
        source = (fixture or {}).get(venue.get("id"))
        check(source is not None, f"unknown venue id {venue.get('id')}")
        if source:
            for field in ("name", "district", "address"):
                check(venue.get(field) == source.get(field), f"ungrounded venue {field}")
            price = venue.get("price")
            if price:
                check(price.get("semantics") == "venue_range", "invented per-person price")
                for dest, src in (("min_vnd", "price_min_vnd"), ("max_vnd", "price_max_vnd")):
                    check(price.get(dest) == source.get(src), f"invented price {dest}")
            hours = venue.get("hours")
            if hours:
                check(hours.get("status") != "verified", "invented verified hours")
                check(hours.get("display") in (None, "Chưa rõ", source.get("hours_display")), "invented hours display")
            rating = venue.get("rating")
            if rating:
                check(rating.get("value") == source.get("rating"), "invented rating")
    for card in cards:
        distance = card.get("distance_m")
        check(card.get("distance_source") == ("unknown" if distance is None else "straight_line_estimate"),
              "distance missing unknown/estimate label")
        if chat.get("allergies"):
            check("allergy_unknown" in [f.get("code") for f in card.get("flags", [])], "allergy card missing unknown warning")
    for block in blocks:
        for node in walk_dicts(block):
            if node.get("status") == "unknown" and "value" in node:
                check(node["value"] in (None, "Chưa rõ"), "invented unknown field value")
    for b in blocks:
        for item in b.get("items", []):
            if item.get("status") == "missing":
                check(item.get("value") in (None, "Chưa rõ"), "invented missing summary field")
    return errors


def walk_dicts(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from walk_dicts(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_dicts(item)


def run_scenario(scenario):
    result = {"id": scenario["id"], "turns": [], "status": "passed"}
    with scenario_app(scenario.get("setup", {})) as (app, client, provider):
        created = client.post("/v1/sessions")
        created.raise_for_status()
        session = created.json()
        url = "/v1/sessions/" + session["session_id"]
        headers = {"X-Session-Token": session["token"]}
        previous = client.get(url, headers=headers).json()
        available(client, url, headers, previous["revision"])
        # Setup is applied through the same public action path, never by mutating stored state.
        start = scenario.get("setup", {}).get("start", {})
        actions = []
        if start.get("area") is not None:
            actions.append({"type": "set_location", "location": start["area"]})
        if start.get("preferences"):
            actions.append({"type": "edit_profile", "patch": start["preferences"]})
        for action in actions:
            setup_calls = provider.calls
            response = client.post(url + "/chat", headers=headers, json={"action": action, "revision": previous["revision"]})
            response.raise_for_status()
            previous = response.json()
            failures = evaluate(previous, {}, previous=None, turn={"action": action}, actual_calls=provider.calls - setup_calls,
                                fixture={v.id: vars(v) for v in app.state.venues.snapshot().venues})
            if failures:
                raise AssertionError(f"setup action failed: {failures}")
        fixture = {v.id: vars(v) for v in app.state.venues.snapshot().venues}
        history, requests, confirmed = [], [], False
        for index, turn in enumerate(scenario["turns"], 1):
            before_calls = provider.calls
            payload = {"revision": previous["revision"]}
            if "repeat_request" in turn:
                payload = deepcopy(requests[turn["repeat_request"] - 1])
            else:
                if ("say" in turn) == ("action" in turn):
                    raise ValueError("Turn requires exactly one say/action")
                payload.update({"text": turn["say"]} if "say" in turn else {"action": turn["action"]})
            requests.append(payload)
            response = client.post(url + "/chat", headers=headers, json=payload)
            body = response.json()
            is_yes = (payload.get("action", {}).get("type") == "confirm_yes" or at(body, "turn.intent") == "CONFIRM_YES")
            if response.status_code == 200 and is_yes and at(previous, "chat.pending.kind", None) == "confirm_plan":
                confirmed = True
            errors = evaluate(body, turn.get("expect", {}), status=response.status_code, previous=previous, turn=turn,
                              history=history, actual_calls=provider.calls - before_calls, fixture=fixture, confirmed=confirmed)
            if response.status_code != 200:
                restored = client.get(url, headers=headers)
                if restored.status_code != 200 or any(restored.json().get(key) != previous.get(key)
                        for key in ("chat", "revision", "tour", "preferences")):
                    errors.append("failed request mutated persisted session")
            else:
                previous = body
                restored = client.get(url, headers=headers)
                if restored.status_code != 200:
                    errors.append("GET session failed after turn")
                else:
                    for key in ("chat", "revision", "tour", "preferences"):
                        if restored.json().get(key) != body.get(key):
                            errors.append(f"persisted {key} differs from response")
            result["turns"].append({"turn": index, "status": "failed" if errors else "passed", "http_status": response.status_code,
                                    "request": payload, "response": body, "intent": at(body, "turn.intent", None), "llm_calls_observed": provider.calls - before_calls, "errors": errors})
        if any(t["errors"] for t in result["turns"]):
            result["status"] = "failed"
    return result


def run_files(paths):
    report = {"scenarios": []}
    for path in paths:
        for scenario in json.loads(Path(path).read_text(encoding="utf-8"))["scenarios"]:
            try:
                result = run_scenario(scenario)
            except ChatUnavailable as exc:
                result = {"id": scenario["id"], "status": "unavailable", "reason": str(exc),
                          "turns": [{"turn": i, "status": "unavailable", "errors": [str(exc)]}
                                    for i, _ in enumerate(scenario["turns"], 1)]}
            except Exception as exc:
                result = {"id": scenario["id"], "status": "failed", "reason": f"{type(exc).__name__}: {exc}", "turns": []}
            report["scenarios"].append(result)
    report["passed"] = all(s["status"] == "passed" for s in report["scenarios"]) and bool(report["scenarios"])
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, default=[ROOT / "qa/chat/scenarios/scenarios.json", ROOT / "qa/chat/scenarios/adversarial.json"])
    parser.add_argument("--report", type=Path, default=Path("chat-scenarios-report.json"))
    args = parser.parse_args()
    report = run_files(args.paths)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for s in report["scenarios"]:
        print(f"{s['id']}: {s['status']} {s.get('reason', '')}")
        for t in s["turns"]:
            print(f"  turn {t['turn']}: {t['status']} {'; '.join(t['errors'])}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
