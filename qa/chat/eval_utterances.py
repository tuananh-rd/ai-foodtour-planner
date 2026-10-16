"""Evaluate intent accuracy and confusion without network providers."""
import argparse
from collections import Counter, defaultdict
import importlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def evaluate(understand, path):
    from app.chat.state import ChatState, Pending
    confusion = defaultdict(Counter)
    cases = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        state = ChatState()
        if row.get("pending"):
            state.pending = Pending("eval-pending", row["pending"])
        # The corpus only supplies a kind, not contextual options/slots. Report this limit.
        result = understand(row["text"], state)
        intent = result.get("intent") if isinstance(result, dict) else result.intent
        intent = getattr(intent, "value", intent)
        confusion[row["intent"]][str(intent)] += 1
        cases.append({"expected": row["intent"], "actual": intent, "correct": row["intent"] == intent})
    correct = sum(c["correct"] for c in cases)
    return {"total": len(cases), "correct": correct, "accuracy": correct / len(cases) if cases else 0,
            "confusion": dict(confusion), "cases": cases,
            "limitation": "pending kind only; corpus has no pending context or last-results fixtures"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=ROOT / "qa/chat/utterances.jsonl")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        module = importlib.import_module("app.chat.understand")
    except ModuleNotFoundError as exc:
        if exc.name != "app.chat.understand":
            raise
        print("understand not available")
        return 0
    understand = getattr(module, "understand", None)
    if not callable(understand):
        print("understand not available")
        return 0
    report = evaluate(understand, args.corpus)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
