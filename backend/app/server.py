"""Server entrypoint: loads git-ignored backend/.env, then builds the app.

Use `uvicorn app.server:app`. Tests import app.main directly so a developer's local
.env (which may enable paid providers) never leaks into test runs.
"""
from app.config import load_local_env

load_local_env()

from app.main import create_app  # noqa: E402

app = create_app()
