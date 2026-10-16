"""No live providers: clocks, concurrent reservations and fake Gemini transport."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import json
import os
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfoNotFoundError

from fastapi.testclient import TestClient
from app.llm.provider import ProviderError
from app.main import create_app
from app.providers.gemini import GeminiClient, GeminiExplanationProvider
from app.repositories.llm_budget import DailyLLMBudget, pacific_zone


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def reply(value=None):
    return json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(value or {})}]}}]}).encode()


class BudgetClock(unittest.TestCase):
    def setUp(self):
        self.now = instant('2026-10-16T06:59:59Z')

    def budget(self, **kw):
        return DailyLLMBudget(18, clock=lambda: self.now, **kw)

    def test_midnight_pacific_not_utc(self):
        budget = self.budget()
        budget.admit()
        self.assertEqual(budget.snapshot()['resets_at'], '2026-10-16T07:00:00Z')
        self.now = instant('2026-10-16T07:00:00Z')
        self.assertEqual(budget.snapshot()['used'], 0)
        budget.admit()
        self.now = instant('2026-10-17T00:00:00Z')
        self.assertEqual(budget.snapshot()['used'], 1)

    def test_dst_short_and_long_days(self):
        for start, end, hours in [('2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z', 23),
                                  ('2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z', 25)]:
            self.now = instant(start)
            budget = self.budget()
            budget.admit()
            reset = instant(budget.snapshot()['resets_at'])
            self.assertEqual(reset, instant(end))
            self.assertEqual((reset-self.now).total_seconds()/3600, hours)
            self.now = reset-timedelta(seconds=1)
            self.assertEqual(budget.snapshot()['used'], 1)
            self.now = reset
            self.assertEqual(budget.snapshot()['used'], 0)

    def test_429_persists_until_next_window_and_late_429_does_not_poison_new_day(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'budget.sqlite'
            budget = self.budget(db_path=path)
            window = budget.admit()
            budget.exhaust(window)
            restarted = self.budget(db_path=path)
            state = restarted.snapshot()
            self.assertEqual((state['used'], state['remaining'], state['exhausted']), (1, 0, True))
            with self.assertRaises(ProviderError):
                restarted.admit()
            self.now = instant('2026-10-16T07:00:00Z')
            restarted.admit()
            budget.exhaust(window)
            self.assertFalse(restarted.snapshot()['exhausted'])
            self.assertEqual(restarted.snapshot()['used'], 1)

    def test_restart_preserves_used_and_limit_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'budget.sqlite'
            first = self.budget(db_path=path)
            first.admit(); first.admit()
            self.assertEqual(self.budget(db_path=path).snapshot()['used'], 2)
        budget = DailyLLMBudget(0)
        self.assertTrue(budget.snapshot()['exhausted'])
        with self.assertRaises(ProviderError):
            budget.admit()
        self.assertEqual(budget.snapshot()['used'], 0)

    def test_concurrent_reservations_never_exceed_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'budget.sqlite'
            for persistent in (False, True):
                shared = self.budget()
                def reserve(_):
                    budget = self.budget(db_path=path) if persistent else shared
                    try:
                        budget.admit()
                        return 1
                    except ProviderError as error:
                        self.assertEqual(error.kind, 'quota')
                        return 0
                with ThreadPoolExecutor(max_workers=12) as pool:
                    self.assertEqual(sum(pool.map(reserve, range(60))), 18)
                budget = self.budget(db_path=path) if persistent else shared
                self.assertEqual(budget.snapshot()['used'], 18)

    def test_documented_fixed_offset_last_resort(self):
        with patch('app.repositories.llm_budget.ZoneInfo', side_effect=ZoneInfoNotFoundError), \
             self.assertLogs('app.repositories.llm_budget', level='WARNING') as logs:
            zone = pacific_zone()
        self.assertEqual(zone.utcoffset(None), timedelta(hours=-8))
        self.assertIn('fixed UTC-08:00', logs.output[0])

    def test_independent_processes_share_one_hard_limit(self):
        code = '''
import sys
from datetime import datetime, timezone
sys.path.insert(0, sys.argv[2])
from app.repositories.llm_budget import DailyLLMBudget
from app.llm.provider import ProviderError
budget = DailyLLMBudget(18, db_path=sys.argv[1], clock=lambda: datetime(2026,10,16,12,tzinfo=timezone.utc))
admitted = 0
for _ in range(12):
    try:
        budget.admit()
        admitted += 1
    except ProviderError as error:
        if error.kind != 'quota':
            raise
print(admitted)
'''
        with tempfile.TemporaryDirectory() as temp:
            path = str(Path(temp)/'budget.sqlite')
            processes = [subprocess.Popen([sys.executable, '-c', code, path,
                str(Path(__file__).resolve().parents[2])], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                for _ in range(4)]
            admitted = 0
            for process in processes:
                out, errors = process.communicate(timeout=20)
                self.assertEqual(process.returncode, 0, errors.decode())
                admitted += int(out)
            self.assertEqual(admitted, 18)


class GeminiBudget(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'GEMINI_API_KEY': 'SYNTHETIC-budget-secret',
            'FOODTOUR_SESSION_DB': '', 'FOODTOUR_BUDGET_DB': '', 'FOODTOUR_LLM_DAILY_BUDGET': '18'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_invalid_limit_defaults_to_18(self):
        for value in ('not-int', '-1', '1.5', 'NaN', '', 'True'):
            with patch.dict(os.environ, {'FOODTOUR_LLM_DAILY_BUDGET': value}):
                self.assertEqual(GeminiClient().daily_budget, 18)
        for value in ('0', '9'):
            with patch.dict(os.environ, {'FOODTOUR_LLM_DAILY_BUDGET': value}):
                self.assertEqual(GeminiClient().daily_budget, int(value))

    def test_transport_retry_and_explanation_each_count_once(self):
        client = GeminiClient(daily_budget=4)
        error = ProviderError('unavailable', status=503)
        with patch('app.providers.gemini.request_bytes', side_effect=[error, reply(), reply({'tom_tat':'test'})]) as transport, \
             patch('app.providers.gemini.time.sleep'):
            self.assertEqual(client.generate_json('s', 'u', {}, deadline_s=5), {})
            self.assertEqual(client.budget.snapshot()['used'], 2)
            self.assertEqual(GeminiExplanationProvider(client).explain({}, deadline_s=5), 'test')
            self.assertEqual(transport.call_count, 3)
            self.assertEqual(client.budget.snapshot()['used'], 3)

    def test_429_blocks_further_transport(self):
        client = GeminiClient()
        with patch('app.providers.gemini.request_bytes', side_effect=ProviderError('quota', status=429)) as transport:
            for _ in range(2):
                with self.assertRaises(ProviderError):
                    client.generate_json('s', 'u', {}, deadline_s=5)
            self.assertEqual(transport.call_count, 1)
        self.assertEqual(client.calls_today, 1)
        self.assertTrue(client.budget.snapshot()['exhausted'])

    def test_retry_refused_locally_still_reports_first_attempt(self):
        from app.llm.provider import LLMExtractor, RulesFirstExtractor
        from app.llm.extract import MockExtractor
        from app.providers.gemini import GeminiExtractionProvider
        client = GeminiClient(daily_budget=1)
        extractor = RulesFirstExtractor(MockExtractor(), LLMExtractor(GeminiExtractionProvider(client)))
        with patch('app.providers.gemini.request_bytes', side_effect=ProviderError('unavailable', status=503)) as transport, \
             patch('app.providers.gemini.time.sleep'):
            result = extractor.extract('muốn đi chơi ăn uống')
        self.assertEqual((transport.call_count, result.llm_calls, result.source), (1, 1, 'mock'))
        self.assertEqual(client.calls_today, 1)

    def test_budget_write_while_session_owned_and_restart_and_no_key_in_api_or_logs(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            'FOODTOUR_SESSION_DB': str(Path(temp)/'sessions.sqlite'), 'FOODTOUR_LLM': 'gemini',
            'FOODTOUR_EXPLAIN': 'template'}):
            app = create_app(data_path=Path(temp)/'absent.json')
            with TestClient(app) as client, patch('app.providers.gemini.request_bytes', return_value=reply({'duration_min':120})), \
                 self.assertLogs('foodtour.access', level='INFO') as logs:
                created = client.post('/v1/sessions').json()
                with app.state.sessions.owned(created['session_id'], created['token']):
                    app.state.llm_budget.admit()
                response = client.post('/v1/sessions/'+created['session_id']+'/messages',
                    headers={'X-Session-Token':created['token']}, json={'text':'muốn đi chơi ăn uống'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['llm_calls'], 1)
                self.assertEqual(response.json()['extraction_source'], 'llm')
                health = client.get('/health').json()
                self.assertEqual(health['llm_budget']['used'], 2)
                self.assertEqual(response.json()['llm_budget']['remaining'], 16)
                self.assertNotIn(os.environ['GEMINI_API_KEY'], response.text+json.dumps(health)+repr(logs.output))
            restarted = create_app(data_path=Path(temp)/'absent.json')
            self.assertEqual(restarted.state.llm_budget.snapshot()['used'], 2)
            self.assertTrue(Path(os.environ['FOODTOUR_SESSION_DB']+'.budget.sqlite').exists())

    def test_rules_cache_local_quota_message_metadata(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'FOODTOUR_LLM':'gemini'}):
            app = create_app(data_path=Path(temp)/'absent.json')
            with TestClient(app) as client, patch('app.providers.gemini.request_bytes', return_value=reply({'duration_min':120})) as transport:
                def message(text):
                    created = client.post('/v1/sessions').json()
                    return client.post('/v1/sessions/'+created['session_id']+'/messages',
                        headers={'X-Session-Token':created['token']}, json={'text':text}).json()
                rules = message('Hồ Gươm trong 2 giờ')
                self.assertEqual((rules['llm_calls'], rules['extraction_source']), (0, 'rules'))
                first = message('muốn đi chơi ăn uống')
                cached = message('muốn đi chơi ăn uống')
                self.assertEqual((first['llm_calls'], first['extraction_source']), (1, 'llm'))
                self.assertEqual((cached['llm_calls'], cached['extraction_source']), (0, 'cache'))
                app.state.llm_budget.exhaust(app.state.llm_budget.admit())
                refused = message('hãy giúp tôi chọn địa điểm')
                self.assertEqual((refused['llm_calls'], refused['extraction_source']), (0, 'rules'))
                self.assertTrue(refused['llm_budget']['exhausted'])
                self.assertEqual(transport.call_count, 1)

    def test_unbudgeted_provider_health_is_null(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'FOODTOUR_LLM':'mock'}):
            with TestClient(create_app(data_path=Path(temp)/'absent.json')) as client:
                self.assertIsNone(client.get('/health').json()['llm_budget'])

    def test_no_key_keeps_rules_available_without_claiming_live_provider(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            'FOODTOUR_LLM':'gemini', 'GEMINI_API_KEY':''}):
            with TestClient(create_app(data_path=Path(temp)/'absent.json')) as client, \
                 patch('app.providers.gemini.request_bytes', side_effect=AssertionError('network')):
                health = client.get('/health').json()
                self.assertEqual(health['llm'], 'mock')
                self.assertFalse(health['llm_configured'])
                self.assertIsNone(health['llm_budget'])
                created = client.post('/v1/sessions').json()
                response = client.post('/v1/sessions/'+created['session_id']+'/messages',
                    headers={'X-Session-Token':created['token']}, json={'text':'Hồ Gươm trong 2 giờ'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['llm_calls'], 0)

    def test_explicit_budget_db_and_corrupt_storage_fail_closed_without_secrets(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            'FOODTOUR_LLM':'gemini', 'FOODTOUR_BUDGET_DB':str(Path(temp)/'budget.sqlite')}):
            app = create_app(data_path=Path(temp)/'absent.json')
            self.assertEqual(app.state.llm_budget.path, Path(temp)/'budget.sqlite')
            Path(temp, 'budget.sqlite').write_bytes(b'corrupt')
            with TestClient(app, raise_server_exceptions=False) as client:
                response = client.get('/health')
                self.assertEqual(response.status_code, 503)
                self.assertNotIn(temp, response.text)
                self.assertNotIn(os.environ['GEMINI_API_KEY'], response.text)
            with patch('app.providers.gemini.request_bytes', side_effect=AssertionError('network')):
                with self.assertRaises(ProviderError):
                    app.state.extractor.llm.provider.client.generate_json('s', 'u', {}, deadline_s=5)

    def test_message_429_reports_attempt_and_authoritative_exhaustion(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'FOODTOUR_LLM':'gemini'}):
            app = create_app(data_path=Path(temp)/'absent.json')
            with TestClient(app) as client, patch('app.providers.gemini.request_bytes',
                    side_effect=ProviderError('quota', status=429)):
                created = client.post('/v1/sessions').json()
                response = client.post('/v1/sessions/'+created['session_id']+'/messages',
                    headers={'X-Session-Token':created['token']}, json={'text':'muốn đi chơi ăn uống'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual((response.json()['llm_calls'], response.json()['extraction_source']), (1, 'rules'))
                self.assertEqual(response.json()['llm_budget'], {'limit':18, 'remaining':0, 'exhausted':True})
                self.assertEqual(client.get('/health').json()['llm_budget']['used'], 1)
