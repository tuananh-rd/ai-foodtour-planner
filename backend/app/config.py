"""Local, git-ignored configuration loader (backend/.env). No dependency, no secret output.

Only project keys are accepted (FOODTOUR_*, provider keys, Maps ID and WEB_ORIGIN). Existing process
environment always wins. Values are never logged or returned; callers get key NAMES only.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[1] / ".env"
ALLOWED = re.compile(r"^(FOODTOUR_[A-Z0-9_]+|GEMINI_API_KEY|ORS_API_KEY|GOOGLE_MAPS_(SERVER_KEY|BROWSER_KEY|MAP_ID)|WEB_ORIGIN)$")


def load_local_env(path: Path | None = None) -> list:
    target = Path(path) if path else DEFAULT_PATH
    loaded = []
    try:
        lines = target.read_text(encoding="utf-8-sig").splitlines()
    except (FileNotFoundError, IsADirectoryError, PermissionError, UnicodeError):
        return loaded
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if not ALLOWED.match(key) or key in os.environ:
            continue
        os.environ[key] = value
        loaded.append(key)
    return loaded
