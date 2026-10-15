"""Export deterministic server OpenAPI, or fail on drift; no dataset is read."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import create_app


def document():
    return json.dumps(create_app().openapi(), ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check drift without writing")
    args = parser.parse_args()
    target = ROOT / "contracts" / "v1" / "openapi.json"
    rendered = document()
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != rendered:
            print("OpenAPI drift: run python tools/export_openapi.py")
            return 1
        print("OpenAPI matches server schema")
        return 0
    target.write_text(rendered, encoding="utf-8")
    print("Exported contracts/v1/openapi.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
