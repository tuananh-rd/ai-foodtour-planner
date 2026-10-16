"""Atomic call reservations, persisted independently of session mutations."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import logging
import sqlite3
import time
from threading import Lock
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.llm.provider import ProviderError


def pacific_zone():
    try:
        return ZoneInfo("America/Los_Angeles")
    except ZoneInfoNotFoundError:
        # Last resort for Windows installations without the optional tzdata package.
        logging.getLogger(__name__).warning("Pacific tzdata unavailable; using fixed UTC-08:00 budget reset")
        return timezone(timedelta(hours=-8))


class DailyLLMBudget:
    def __init__(self, limit, *, db_path=None, clock=None, zone=None):
        self.limit = limit
        self.path = Path(db_path) if db_path else None
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.zone = zone or pacific_zone()
        self._lock = Lock()
        self._state = (None, 0, False)

    def _connect(self):
        # Windows can report BUSY during the initial switch to WAL before
        # busy_timeout applies. Retry acquisition only, never a reservation.
        end = time.monotonic() + 5
        while True:
            db = None
            try:
                db = sqlite3.connect(self.path, timeout=0.2, isolation_level=None)
                db.execute("PRAGMA busy_timeout=200")
                if db.execute("PRAGMA journal_mode").fetchone()[0] != "wal":
                    db.execute("PRAGMA journal_mode=WAL")
                db.execute("BEGIN IMMEDIATE")
                return db
            except sqlite3.Error as error:
                if db is not None:
                    db.close()
                busy = (getattr(error, "sqlite_errorcode", 0) & 255) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)
                if not busy or time.monotonic() >= end:
                    raise
                time.sleep(0.01)

    @contextmanager
    def _storage(self):
        with self._lock:
            if self.path is None:
                yield None
                return
            db = None
            try:
                if not self.path.is_absolute():
                    raise ValueError
                db = self._connect()
                db.execute("CREATE TABLE IF NOT EXISTS llm_budget (id INTEGER PRIMARY KEY CHECK(id=1), "
                           "window TEXT NOT NULL, used INTEGER NOT NULL, exhausted INTEGER NOT NULL, resets_at TEXT NOT NULL)")
                yield db
                db.commit()
            except (sqlite3.Error, ValueError):
                raise ProviderError("unavailable") from None
            finally:
                if db is not None:
                    if db.in_transaction:
                        db.rollback()
                    db.close()

    def _operate(self, operation, admitted_window=None):
        with self._storage() as db:
            local = self.clock().astimezone(self.zone)
            window = local.date().isoformat()
            tomorrow = local.date() + timedelta(days=1)
            reset = datetime.combine(tomorrow, datetime.min.time(), self.zone).astimezone(timezone.utc)
            state = db.execute("SELECT window,used,exhausted FROM llm_budget WHERE id=1").fetchone() if db else self._state
            _, used, exhausted = state if state and state[0] == window else (window, 0, False)
            denied = operation == "admit" and (exhausted or used >= self.limit)
            if operation == "admit" and not denied:
                used += 1
            if operation == "exhaust" and admitted_window == window:
                exhausted = True
            if db:
                db.execute("INSERT INTO llm_budget VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                           "window=excluded.window,used=excluded.used,exhausted=excluded.exhausted,resets_at=excluded.resets_at",
                           (window, used, int(exhausted), reset.isoformat()))
            else:
                self._state = (window, used, exhausted)
            result = dict(limit=self.limit, used=used, remaining=0 if exhausted else max(0, self.limit-used),
                          exhausted=bool(exhausted or used >= self.limit),
                          resets_at=reset.isoformat().replace("+00:00", "Z"), window="pacific_midnight")
        # Commit resets even when admission is denied.
        if denied:
            raise ProviderError("quota")
        return window if operation == "admit" else result

    def admit(self):
        return self._operate("admit")

    def exhaust(self, admitted_window):
        self._operate("exhaust", admitted_window)

    def snapshot(self):
        return self._operate("read")
