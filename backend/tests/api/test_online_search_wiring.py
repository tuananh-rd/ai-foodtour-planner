"""Real HTTP composition with actual adapter/SQLite and mocked external transports only."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from app.main import create_app
from app.repositories.sessions import SessionStore

ROOT = Path(__file__).resolve().parents[3]


class OnlineSearchWiringTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = patch.dict(os.environ, {
            'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_UI_GUIDED': '1', 'FOODTOUR_LLM': 'mock',
            'FOODTOUR_EXPLAIN': 'template', 'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_GEOCODER': 'off',
            'FOODTOUR_DATA_PATH': str(ROOT / 'contracts/fixtures/venues.chat.synthetic.json'),
            'FOODTOUR_EVIDENCE_PATH': '', 'FOODTOUR_TAVILY_ENABLED': '1',
            'FOODTOUR_TAVILY_FREE_ONLY': '1', 'TAVILY_API_KEY': '',
            'FOODTOUR_TAVILY_BUDGET_DB': str(Path(self.directory.name) / 'credits.sqlite'),
            'FOODTOUR_TAVILY_DAILY_CREDITS': '20', 'FOODTOUR_TAVILY_MONTHLY_CREDITS': '500'})
        self.env.start(); self.addCleanup(self.env.stop)
        self.usage = Mock(return_value={'account': {'current_plan': 'Researcher', 'plan_usage': 0,
            'plan_limit': 1000, 'paygo_usage': 0, 'paygo_limit': 0}, 'key': {'usage': 0, 'limit': 500}})
        self.post = Mock(return_value={'usage': {'credits': 1}, 'results': [
            {'title': '[SYNTHETIC] Public food quote', 'url': 'https://example.com/synthetic-food',
             'content': 'Synthetic quote; no venue facts asserted.'}]})
        for target, replacement in [('tavily_usage', self.usage), ('tavily_post', self.post)]:
            mocked = patch('app.providers.tavily.' + target, replacement)
            mocked.start(); self.addCleanup(mocked.stop)

    def client(self, **kwargs):
        return TestClient(create_app(sessions=SessionStore(), **kwargs))

    @staticmethod
    def owned_session(client):
        response = client.post('/v1/sessions', json={})
        assert response.status_code == 200
        session = response.json()
        return session['session_id'], {'X-Session-Token': session['token']}

    @staticmethod
    def block(response):
        return next(block for block in response.json()['reply']['blocks'] if block['type'] == 'web_search')

    def test_missing_key_default_factory_stays_disabled_without_outbound(self):
        with self.client() as client:
            self.assertFalse(client.get('/health').json()['web_search_configured'])
            session, headers = self.owned_session(client)
            response = client.post(f'/v1/sessions/{session}/chat', headers=headers,
                json={'revision': 0, 'text': 'phở quanh Hồ Gươm', 'web_search': True})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.block(response)['status'], 'disabled')
        self.usage.assert_not_called(); self.post.assert_not_called()

    def test_actual_factory_adapter_cache_revision_and_read_only_http_state(self):
        with patch.dict(os.environ, {'TAVILY_API_KEY': 'SYNTHETIC_TEST_ONLY'}), self.client() as client:
            self.assertTrue(client.get('/health').json()['web_search_configured'])
            self.usage.assert_not_called(); self.post.assert_not_called()
            session, headers = self.owned_session(client)
            endpoint = f'/v1/sessions/{session}/chat'
            before = client.get(f'/v1/sessions/{session}', headers=headers).json()
            query = {'revision': 0, 'text': 'phở quanh Hồ Gươm 500k cho 4 người', 'web_search': True}
            self.assertEqual(client.post(endpoint, headers=headers, json=dict(query, revision=999)).status_code, 409)
            self.usage.assert_not_called(); self.post.assert_not_called()
            first = client.post(endpoint, headers=headers, json=query)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(self.block(first)['status'], 'ok')
            self.assertEqual(self.block(first)['credits'], 1)
            self.assertEqual(self.usage.call_count, 1); self.assertEqual(self.post.call_count, 1)
            after = client.get(f'/v1/sessions/{session}', headers=headers).json()
            self.assertEqual(after['preferences'], before['preferences'])
            self.assertEqual(after['tour'], before['tour'])
            for field in ('profile', 'allergies', 'pending'):
                self.assertEqual(after['chat'][field], before['chat'][field])
            self.assertEqual(client.post(endpoint, headers=headers, json=query).status_code, 409)
            cached = client.post(endpoint, headers=headers, json=dict(query, revision=first.json()['revision']))
            self.assertEqual(cached.status_code, 200)
            self.assertTrue(self.block(cached)['cached']); self.assertEqual(self.block(cached)['credits'], 0)
            self.assertEqual(self.block(cached)['fetched_at'], self.block(first)['fetched_at'])
            self.assertEqual(self.usage.call_count, 1); self.assertEqual(self.post.call_count, 1)
            self.assertEqual(self.post.call_args.args[0]['query'], query['text'])

    def test_explicit_falsey_injection_is_preserved(self):
        class InjectedSearch:
            configured = True

            def __bool__(self):
                return False

            def search(self, *args, **kwargs):
                return dict(status='quota', sources=[], fetched_at=None, credits=0, cached=False)

        with self.client(web_search=InjectedSearch()) as client:
            session, headers = self.owned_session(client)
            response = client.post(f'/v1/sessions/{session}/chat', headers=headers,
                json={'revision': 0, 'text': 'phở quanh Hồ Gươm', 'web_search': True})
            self.assertEqual(self.block(response)['status'], 'quota')
        self.usage.assert_not_called(); self.post.assert_not_called()
