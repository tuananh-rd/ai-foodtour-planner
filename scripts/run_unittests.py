"""Discover every backend test, including the self-contained synthetic legacy suite."""
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(ROOT))  # legacy tests import backend.tests; retain it after chdir below
os.chdir(BACKEND)


def main():
    suite = unittest.defaultTestLoader.discover(str(BACKEND), top_level_dir=str(BACKEND))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
