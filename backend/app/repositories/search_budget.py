"""Conservative persisted Tavily credits: UTC day AND month, atomic admission."""
from datetime import datetime, timezone
from contextlib import closing
from pathlib import Path
import sqlite3

from app.llm.provider import ProviderError


class SearchCreditBudget:
    def __init__(self, db_path, *, daily_limit=20, monthly_limit=500, clock=None):
        self.path = Path(db_path) if db_path else None
        self.daily_limit, self.monthly_limit = daily_limit, monthly_limit
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.valid = bool(self.path and self.path.is_absolute()
            and type(daily_limit) is int and type(monthly_limit) is int
            and 0 < daily_limit <= monthly_limit <= 900)

    def admit(self):
        """Reserve one BASIC credit before transport. Failed requests are not refunded."""
        if not self.valid:
            raise ProviderError('unavailable')
        moment = self.clock().astimezone(timezone.utc)
        day, month = moment.strftime('%Y-%m-%d'), moment.strftime('%Y-%m')
        connection = None
        try:
            # Never silently create directories or fall back to in-memory limits.
            connection = sqlite3.connect(str(self.path), timeout=2, isolation_level=None)
            connection.execute('BEGIN IMMEDIATE')
            connection.execute('CREATE TABLE IF NOT EXISTS search_credits (window TEXT PRIMARY KEY, used INTEGER NOT NULL CHECK(used >= 0))')
            connection.execute('CREATE TABLE IF NOT EXISTS search_blocks (window TEXT PRIMARY KEY)')
            if connection.execute('SELECT 1 FROM search_blocks WHERE window=?', ('month:' + month,)).fetchone():
                raise ProviderError('quota')
            windows = [('day:' + day, self.daily_limit), ('month:' + month, self.monthly_limit)]
            for window, limit in windows:
                row = connection.execute('SELECT used FROM search_credits WHERE window=?', (window,)).fetchone()
                if row and (type(row[0]) is not int or row[0] < 0):
                    raise ProviderError('unavailable')
                if row and row[0] >= limit:
                    raise ProviderError('quota')
            for window, _ in windows:
                connection.execute('INSERT INTO search_credits VALUES (?,1) ON CONFLICT(window) DO UPDATE SET used=used+1', (window,))
            connection.execute('COMMIT')
            return {'day': day, 'month': month, 'credits': 1}
        except ProviderError:
            if connection and connection.in_transaction:
                connection.execute('ROLLBACK')
            raise
        except (sqlite3.Error, OSError, ValueError):
            if connection and connection.in_transaction:
                connection.execute('ROLLBACK')
            raise ProviderError('unavailable') from None
        finally:
            if connection:
                connection.close()

    def block_current_month(self):
        """Unexpected provider credit usage disables further requests durably."""
        if not self.valid:
            raise ProviderError('unavailable')
        month = self.clock().astimezone(timezone.utc).strftime('%Y-%m')
        try:
            with closing(sqlite3.connect(str(self.path), timeout=2)) as connection:
                with connection:
                    connection.execute('CREATE TABLE IF NOT EXISTS search_blocks (window TEXT PRIMARY KEY)')
                    connection.execute('INSERT OR IGNORE INTO search_blocks VALUES (?)', ('month:' + month,))
        except (sqlite3.Error, OSError, ValueError):
            raise ProviderError('unavailable') from None
