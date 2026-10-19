from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest

from app.llm.provider import ProviderError
from app.repositories.search_budget import SearchCreditBudget


class SearchBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'budget.sqlite'
        self.now = datetime(2026, 10, 19, 1, tzinfo=timezone.utc)

    def budget(self, daily=2, monthly=3):
        return SearchCreditBudget(self.path, daily_limit=daily, monthly_limit=monthly, clock=lambda: self.now)

    def test_durable_daily_monthly_and_reset(self):
        self.budget().admit()
        self.budget().admit()
        with self.assertRaises(ProviderError) as error:
            self.budget().admit()
        self.assertEqual(error.exception.kind, 'quota')
        self.now = self.now.replace(day=20)
        self.budget().admit()
        with self.assertRaises(ProviderError):
            self.budget().admit()
        self.now = self.now.replace(month=11, day=1)
        self.budget().admit()

    def test_concurrent_admission_is_bounded(self):
        def attempt(_):
            try:
                self.budget(daily=3, monthly=4).admit()
                return True
            except ProviderError:
                return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(attempt, range(16))), 3)

    def test_unexpected_usage_blocks_month_across_restart_and_day_rollover(self):
        self.budget().admit()
        self.budget().block_current_month()
        self.now = self.now.replace(day=20)
        with self.assertRaises(ProviderError) as error:
            self.budget().admit()
        self.assertEqual(error.exception.kind, 'quota')
        self.now = self.now.replace(month=11, day=1)
        self.budget().admit()

    def test_invalid_or_corrupt_storage_fails_closed(self):
        for path, daily, monthly in ((None, 2, 3), ('relative.sqlite', 2, 3), (self.path, 5, 3),
                                     (self.path, True, 3), (self.path, 1, 1001)):
            with self.assertRaises(ProviderError):
                SearchCreditBudget(path, daily_limit=daily, monthly_limit=monthly).admit()
        self.path.write_text('not sqlite', encoding='utf-8')
        with self.assertRaises(ProviderError):
            self.budget().admit()
