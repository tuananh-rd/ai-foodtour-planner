"""Hermetic error classification, no network/provider calls."""
import unittest
from unittest.mock import patch
from app.discovery.engine import handle
from app.discovery.state import State
from app.discovery.tools import Tools
from app.llm.provider import ProviderError
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_discovery import fixture


class OutageTests(unittest.TestCase):
    def tools(self):
        return Tools(State(), fixture(), StraightLineEstimator())

    def model(self, error):
        class Model:
            configured, mode, calls = True, 'gemini', 0
            def generate(self, *args, **kwargs):
                self.calls += 1
                raise error
        return Model()

    def test_timeout_is_not_quota_and_does_not_repeat_apology(self):
        tools, model = self.tools(), self.model(ProviderError('timeout'))
        for text in ('Chào bạn', 'tôi muốn đi ăn phở vào tối nay tại đống đa'):
            reply, provider = handle(text, tools, model=model)
            self.assertEqual(provider['failure'], {'kind': 'timeout', 'source': 'transport'})
            self.assertEqual(provider['reply_source'], 'rules')
            self.assertEqual(provider['reason'], 'timeout_rules_fallback')
            self.assertNotIn('Model chưa phản hồi', reply['text'])
            self.assertNotIn('đạt giới hạn', reply['text'])
        self.assertEqual(tools.state.profile.area, 'Đống Đa')
        self.assertIn('phở', tools.state.profile.foods)
        self.assertEqual(model.calls, 2)

    def test_session_cap_is_local_and_makes_no_generation(self):
        model = self.model(AssertionError('must not call'))
        _, provider = handle('Chào bạn', self.tools(), model=model, llm_used=6, session_cap=6)
        self.assertEqual(provider['failure'], {'kind': 'quota', 'source': 'session_cap'})
        self.assertEqual(provider['calls'], 0)
        self.assertEqual(model.calls, 0)

    def test_local_admission_is_not_a_provider_http_error(self):
        error = ProviderError('quota')
        error.llm_calls = 0
        _, provider = handle('Chào bạn', self.tools(), model=self.model(error))
        self.assertEqual(provider['failure'], {'kind': 'quota', 'source': 'local_admission'})

    def test_timeout_after_read_tools_preserves_results_without_repeat_notice(self):
        tools = self.tools()
        tools.state.patch({'origin': {'lat': 21.035, 'lon': 105.783}})
        class Model:
            configured, mode, calls = True, 'gemini', 0
            def generate(self, *args, **kwargs):
                self.calls += 1
                if self.calls == 1:
                    return {'role': 'model', 'parts': [{'functionCall': {
                        'name': 'search_restaurants', 'args': {'dish': 'phở', 'area': 'Xuân Thủy'}}}]}
                raise ProviderError('timeout')
        reply, provider = handle('Tìm phở quanh Xuân Thủy', tools, model=Model())
        self.assertTrue(tools.state.results)
        self.assertEqual(provider['reply_source'], 'tools')
        self.assertEqual(provider['failure']['source'], 'transport')
        self.assertNotIn('Model chưa hoàn tất', reply['text'])

    def test_reserve_is_local_and_http429_is_explicit(self):
        model = self.model(AssertionError('must not call'))
        class Budget:
            def snapshot(self): return {'remaining': 3}
        class Client:
            budget = Budget()
        model.client = Client()
        _, provider = handle('Chào bạn', self.tools(), model=model, reserve=3)
        self.assertEqual(provider['failure'], {'kind': 'quota', 'source': 'daily_reserve'})
        self.assertEqual(model.calls, 0)
        for status, kind in ((429, 'quota'), (403, 'unavailable'), (500, 'unavailable')):
            _, provider = handle('Chào bạn', self.tools(), model=self.model(ProviderError(kind, status=status)))
            self.assertEqual(provider['failure'], {'kind': kind, 'source': 'provider_http', 'http_status': status})

    def test_turn_deadline_is_not_classified_as_quota(self):
        model = self.model(AssertionError('must not call'))
        with patch('app.discovery.engine.time.monotonic', side_effect=[0, 12]):
            _, provider = handle('Chào bạn', self.tools(), model=model)
        self.assertEqual(provider['failure'], {'kind': 'timeout', 'source': 'turn_deadline'})
        self.assertEqual(model.calls, 0)

    def test_failure_restore_is_bounded_and_drops_untrusted_metadata(self):
        state = self.tools().state
        state.last_provider_failure = {'kind': 'timeout', 'source': 'transport'}
        self.assertEqual(State.restore(state.dump()).last_provider_failure, state.last_provider_failure)
        raw = state.dump()
        raw['last_provider_failure']['secret_body'] = 'must not retain'
        self.assertIsNone(State.restore(raw).last_provider_failure)

    def test_read_only_api_keeps_failure_until_actual_model_recovery(self):
        import os
        import tempfile
        from pathlib import Path
        from fastapi.testclient import TestClient
        from app.main import create_app
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
                'FOODTOUR_SESSION_DB': str(Path(tmp)/'sessions.sqlite'), 'FOODTOUR_LLM': 'mock',
                'GEMINI_API_KEY': '', 'FOODTOUR_EXPLAIN': 'template'}):
            app = create_app(data_path=Path('contracts/fixtures/venues.chat.synthetic.json').resolve())
            model = self.model(ProviderError('timeout'))
            app.state.discovery_model = model
            with TestClient(app) as client:
                session = client.post('/v1/sessions', json={}).json()
                route = '/v1/sessions/'+session['session_id']+'/assistant'
                headers = {'X-Session-Token': session['token']}
                first = client.post(route, headers=headers, json={'revision': 0, 'text': 'Chào bạn'}).json()
                read = client.get(route, headers=headers).json()
                self.assertEqual(read['provider']['failure'], {'kind': 'timeout', 'source': 'transport'})
                self.assertEqual(read['provider']['calls'], 0)
                self.assertEqual(model.calls, 1)
                client.post(route, headers=headers, json={'revision': first['revision'], 'action': {
                    'type': 'location', 'arguments': {'operation': 'coordinates', 'source': 'coordinates', 'lat': 21.03, 'lon': 105.85}}})
                self.assertEqual(client.get(route, headers=headers).json()['provider']['failure']['kind'], 'timeout')
                class Recovered:
                    configured, mode = True, 'gemini'
                    def generate(self, *args, **kwargs):
                        return {'role': 'model', 'parts': [{'text': 'Chào bạn.'}]}
                app.state.discovery_model = Recovered()
                current = client.get(route, headers=headers).json()
                client.post(route, headers=headers, json={'revision': current['revision'], 'text': 'Xin chào'})
                self.assertNotIn('failure', client.get(route, headers=headers).json()['provider'])

    def test_sanitized_failure_logging_preserves_status_not_exception_body(self):
        import os
        import tempfile
        from pathlib import Path
        from fastapi.testclient import TestClient
        from app.main import create_app
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
                'FOODTOUR_SESSION_DB': str(Path(tmp)/'sessions.sqlite'), 'FOODTOUR_LLM': 'mock',
                'GEMINI_API_KEY': '', 'FOODTOUR_EXPLAIN': 'template'}):
            app = create_app(data_path=Path('contracts/fixtures/venues.chat.synthetic.json').resolve())
            app.state.discovery_model = self.model(ProviderError('unavailable', 'SECRET_SENTINEL_BODY', status=403))
            with TestClient(app) as client:
                session = client.post('/v1/sessions', json={}).json()
                from app.api.security import ACCESS_LOG
                with self.assertLogs(ACCESS_LOG, level='INFO') as logged:
                    response = client.post('/v1/sessions/'+session['session_id']+'/assistant',
                        headers={'X-Session-Token': session['token']}, json={'revision': 0, 'text': 'Chào bạn'})
                self.assertEqual(response.status_code, 200)
                self.assertIn('"provider_http_status": 403', ' '.join(logged.output))
                self.assertIn('"provider_failure_source": "provider_http"', ' '.join(logged.output))
                self.assertNotIn('SECRET_SENTINEL_BODY', ' '.join(logged.output))
