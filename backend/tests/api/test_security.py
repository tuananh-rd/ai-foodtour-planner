import asyncio
import json
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import create_app
from app.api.errors import APIError
from app.api.security import RateLimiter


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'absent.json'

    def client(self, **env):
        with patch.dict(os.environ, env):
            app = create_app(data_path=self.path)
        client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(client.close)
        return client

    def assert_envelope(self, response, status):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(set(response.json()), {'error'})
        self.assertIn('code', response.json()['error'])
        self.assertNotIn('SENSITIVE_SENTINEL', response.text)
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response.headers['Referrer-Policy'], 'no-referrer')
        self.assertRegex(response.headers['X-Request-ID'], r'^[a-f0-9]{32}$')

    def test_uniform_errors_no_input_echo_or_traceback(self):
        client = self.client()
        @client.app.get('/crash')
        def crash():
            raise RuntimeError('SENSITIVE_SENTINEL')
        for response, status in [
            (client.get('/SENSITIVE_SENTINEL'), 404),
            (client.delete('/v1/sessions'), 405),
            (client.post('/v1/sessions/a/messages', json={'SENSITIVE_SENTINEL': 'secret'}), 422),
            (client.post('/v1/sessions', content=b'x' * 8193), 413),
            (client.get('/crash'), 500),
        ]:
            self.assert_envelope(response, status)
            self.assertNotIn('Traceback', response.text)

    def test_session_headers_and_server_issued_request_ids(self):
        client = self.client()
        with self.assertLogs('foodtour.access', level='INFO') as captured:
            first = client.post('/v1/sessions', headers={'X-Request-ID': 'SENSITIVE_SENTINEL'})
        self.assertEqual(first.headers['Cache-Control'], 'no-store')
        self.assertNotEqual(first.headers['X-Request-ID'], 'SENSITIVE_SENTINEL')
        record = json.loads(captured.records[0].getMessage())
        self.assertEqual(record['request_id'], first.headers['X-Request-ID'])
        second = client.get('/health')
        self.assertNotEqual(first.headers['X-Request-ID'], second.headers['X-Request-ID'])
        self.assertNotIn('SENSITIVE_SENTINEL', captured.output[0])

    def test_logs_have_only_allowlisted_fields_and_route_template(self):
        client = self.client()
        created = client.post('/v1/sessions').json()
        with self.assertLogs('foodtour.access', level='INFO') as captured:
            response = client.post('/v1/sessions/' + created['session_id'] + '/messages?private=SENSITIVE_SENTINEL',
                headers={'X-Session-Token': created['token']}, json={'text': 'SENSITIVE_SENTINEL'})
            client.get('/unknown/SENSITIVE_SENTINEL')
        for record in captured.records:
            data = json.loads(record.getMessage())
            self.assertEqual(set(data), {'request_id', 'route', 'status', 'latency_ms'})
            self.assertIsInstance(data['latency_ms'], (int, float))
            self.assertNotIn(created['token'], record.getMessage())
            self.assertNotIn(created['session_id'], record.getMessage())
            self.assertNotIn('SENSITIVE_SENTINEL', record.getMessage())
        self.assertEqual(json.loads(captured.records[0].getMessage())['route'],
                         '/v1/sessions/{session_id}/messages')
        self.assertEqual(json.loads(captured.records[1].getMessage())['route'], '<unmatched>')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(logging.getLogger('uvicorn.access').disabled)

    def test_cors_exact_origin_including_guard_errors(self):
        client = self.client(WEB_ORIGIN='http://localhost:3333')
        for origin, allowed in [('http://localhost:3333', True), ('http://evil.invalid', False)]:
            for response in [client.get('/health', headers={'Origin': origin}),
                             client.post('/v1/sessions', headers={'Origin': origin}, content=b'x' * 8193)]:
                self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), origin if allowed else None)
            preflight = client.options('/v1/sessions', headers={'Origin': origin,
                'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Session-Token,X-Request-ID'})
            self.assertEqual(preflight.status_code, 200 if allowed else 400)

    def test_ip_rate_limit_includes_create_and_ignores_forwarded_header(self):
        client = self.client(FOODTOUR_RATE_LIMIT_IP='2')
        self.assertEqual(client.post('/v1/sessions').status_code, 200)
        self.assertEqual(client.post('/v1/sessions').status_code, 200)
        limited = client.post('/v1/sessions', headers={'X-Forwarded-For': 'another-client'})
        self.assert_envelope(limited, 429)
        self.assertEqual(limited.json()['error']['code'], 'rate_limited')

    def test_wildcard_cors_config_fails_closed(self):
        for config in ['*', 'https://user:password@example.invalid', 'https://example.invalid/path']:
            response = self.client(WEB_ORIGIN=config).get('/health', headers={'Origin': 'https://example.invalid'})
            self.assertNotIn('Access-Control-Allow-Origin', response.headers)

    def test_cors_comma_separated_origins_for_localhost_and_loopback(self):
        client = self.client(WEB_ORIGIN=' http://localhost:3000, http://127.0.0.1:3000 ,*')
        for origin in ['http://localhost:3000', 'http://127.0.0.1:3000']:
            self.assertEqual(client.get('/health', headers={'Origin': origin}).headers.get(
                'Access-Control-Allow-Origin'), origin)
            self.assertEqual(client.post('/v1/sessions', content=b'x' * 8193,
                headers={'Origin': origin}).headers.get('Access-Control-Allow-Origin'), origin)
        self.assertNotIn('Access-Control-Allow-Origin',
            client.get('/health', headers={'Origin': 'http://other.invalid'}).headers)

    def test_blank_data_and_database_environment_are_unset(self):
        from app.data import loader
        from app.repositories.sessions import SessionStore
        for value in ['', '  \t  ']:
            with patch.dict(os.environ, {'FOODTOUR_DATA_PATH': value, 'FOODTOUR_SESSION_DB': value}), \
                 patch.object(loader, 'DEFAULT_PATH', self.path):
                app = create_app()
                self.assertIsInstance(app.state.sessions, SessionStore)
                with TestClient(app) as client:
                    response = client.get('/health')
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()['dataset_source'], 'synthetic')

    def test_known_and_unknown_tokens_use_constant_time_comparison(self):
        import secrets
        from app.repositories.sessions import SessionStore
        store = SessionStore()
        created = store.create()
        with patch('app.repositories.sessions.secrets.compare_digest', wraps=secrets.compare_digest) as compared:
            with store.owned(created['session_id'], created['token']):
                pass
            self.assertEqual(compared.call_count, 1)
            with self.assertRaises(APIError):
                with store.owned('unknown', created['token']):
                    self.fail('unknown allowed')
            self.assertEqual(compared.call_count, 2)

    def test_token_rate_limit_is_configurable_and_isolated(self):
        client = self.client(FOODTOUR_RATE_LIMIT_TOKEN='2', FOODTOUR_RATE_LIMIT_IP='100')
        first, second = client.post('/v1/sessions').json(), client.post('/v1/sessions').json()
        url = '/v1/sessions/' + first['session_id']
        headers = {'X-Session-Token': first['token']}
        self.assertEqual(client.get(url, headers=headers).status_code, 200)
        self.assertEqual(client.get(url, headers=headers).status_code, 200)
        self.assert_envelope(client.get(url, headers=headers), 429)
        self.assertEqual(client.get('/v1/sessions/' + second['session_id'],
            headers={'X-Session-Token': second['token']}).status_code, 200)

    def test_limit_windows_reset_and_memory_is_bounded(self):
        now = [0]
        limiter = RateLimiter(10, capacity=2, clock=lambda: now[0])
        self.assertTrue(limiter.allow('a', 1))
        self.assertFalse(limiter.allow('a', 1))
        now[0] = 11
        self.assertTrue(limiter.allow('a', 1))
        limiter.allow('b', 1)
        limiter.allow('c', 1)
        self.assertLessEqual(len(limiter.entries), 2)

    def test_declared_and_streamed_body_limits_precede_session_creation(self):
        client = self.client(FOODTOUR_BODY_LIMIT_BYTES='512')
        self.assert_envelope(client.post('/v1/sessions', content=b'', headers={'Content-Length': '9999'}), 413)
        self.assert_envelope(client.post('/v1/sessions', content=b'x' * 513), 413)
        self.assertFalse(client.app.state.sessions._sessions)
        async def stream():
            incoming = iter([{'type': 'http.request', 'body': b'', 'more_body': True},
                             {'type': 'http.request', 'body': b'x' * 300, 'more_body': True},
                             {'type': 'http.request', 'body': b'y' * 300, 'more_body': False}])
            sent = []
            async def receive():
                return next(incoming)
            async def send(message):
                sent.append(message)
            scope = {'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
                     'method': 'POST', 'scheme': 'http', 'path': '/v1/sessions', 'raw_path': b'/v1/sessions',
                     'query_string': b'', 'root_path': '', 'headers': [], 'client': ('127.0.0.1', 123),
                     'server': ('127.0.0.1', 80)}
            await client.app(scope, receive, send)
            return sent
        sent = asyncio.run(stream())
        self.assertEqual(sent[0]['status'], 413)
        self.assertEqual(json.loads(sent[1]['body'])['error']['code'], 'validation_error')
        self.assertFalse(client.app.state.sessions._sessions)
