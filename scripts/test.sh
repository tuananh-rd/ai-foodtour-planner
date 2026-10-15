#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${PYTHON:-}" ]]; then
  python_command="$PYTHON"
elif [[ -x "$script_dir/../.venv/bin/python" ]]; then
  python_command="$script_dir/../.venv/bin/python"
elif [[ -x "$script_dir/../.venv/Scripts/python.exe" ]]; then
  python_command="$script_dir/../.venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
  python_command=python3
else
  python_command=python
fi
exec "$python_command" "$script_dir/local.py" test "$@"
