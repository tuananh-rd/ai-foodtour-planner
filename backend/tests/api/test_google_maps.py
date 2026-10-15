"""v1.5 API integration on synthetic venues and loopback Google fakes."""
import json
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient

from app.main import create_app
from app.llm.extract import ExtractionResult
from app.planner.types import Preferences
from app.repositories.sessions import SessionStore
from app.repositories.sqlite_sessions import SQLiteSessionStore
from app.repositories.venues import VenueRepository
from app.planner.interfaces import StraightLineEstimator
from tests.providers import test_google_maps as fake


class GoogleAPI(unittest.TestCase):
    def setUp(self):
        fake.GoogleFakeCase.setUp(self)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'absent.json'
        env = patch.dict(os.environ, {'FOODTOUR_LLM': 'mock', 'FOODTOUR_EXPLAIN': 'template',
            'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_GEOCODER': '', 'FOODTOUR_SESSION_DB': '',
            'GOOGLE_MAPS_BROWSER_KEY': '', 'GOOGLE_MAPS_MAP_ID': '', 'FOODTOUR_EVIDENCE_PATH': ''})
        env.start()
        self.addCleanup(env.stop)
        self.app = create_app(data_path=self.path)
        self.app.state.routing = fake.GoogleRoutesProvider(self.base)
        self.app.state.geocoder = fake.GoogleGeocoder(self.base)
        self.app.state.provider_info['routing_provider'] = 'google_routes'
        self.client = TestClient(self.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def session(self):
        r = self.client.post('/v1/sessions')
        self.assertEqual(r.status_code, 200)
        return r.json(), {'X-Session-Token': r.json()['token']}

    def test_config_unavailable_null_keys_and_ready_browser_key_only(self):
        r = self.client.get('/v1/client-config')
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertEqual(r.json()['maps']['status'], 'unavailable')
        self.assertIsNone(r.json()['maps']['js_api_key'])
        self.assertIsNone(r.json()['maps']['map_id'])
        with patch.dict(os.environ, {'GOOGLE_MAPS_BROWSER_KEY': 'fake-restricted-browser-key', 'GOOGLE_MAPS_MAP_ID': 'synthetic-map'}):
            r = self.client.get('/v1/client-config')
            self.assertEqual(r.json()['maps']['status'], 'ready')
            self.assertEqual(r.json()['maps']['js_api_key'], 'fake-restricted-browser-key')
        with patch.dict(os.environ, {'GOOGLE_MAPS_BROWSER_KEY': fake.KEY, 'GOOGLE_MAPS_MAP_ID': 'synthetic-map'}):
            r = self.client.get('/v1/client-config')
            self.assertEqual(r.json()['maps']['status'], 'unavailable')
        self.assertNotIn(fake.KEY, r.text)

    def test_health_routing_and_geocoding_no_secrets(self):
        r = self.client.get('/health')
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['routing_provider'], 'google_routes')
        self.assertEqual(r.json()['geocoding'], {'status': 'ready', 'last_error': None})
        self.assertNotIn(fake.KEY, r.text)
        self.app.state.geocoder = fake.GoogleGeocoder(base_url=None)
        self.assertEqual(self.client.get('/health').json()['geocoding']['status'], 'unavailable')

    def test_map_bbox_limit_truncated_q_allowlist_and_bounds(self):
        url = '/v1/venues/map?min_lat=20&max_lat=22&min_lon=105&max_lon=107&limit=1'
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(len(body['items']), 1)
        self.assertGreater(body['total_in_view'], 1)
        self.assertTrue(body['truncated'])
        self.assertEqual(set(body['items'][0]), {'id', 'name', 'lat', 'lon', 'district', 'dish_tags', 'price_max_vnd', 'synthetic'})
        self.assertEqual(body['dataset_source'], 'synthetic')
        ident = body['items'][0]['id']
        self.assertEqual(self.client.get('/v1/venues/' + ident).status_code, 200)
        self.assertEqual(self.client.get(url + '&q=NoSuchSyntheticVenue').json()['total_in_view'], 0)
        empty = '/v1/venues/map?min_lat=0&max_lat=1&min_lon=0&max_lon=1'
        self.assertEqual(self.client.get(empty).json()['items'], [])
        for suffix in ('&limit=501', '&limit=0', '&min_lat=23', '&max_lon=nan'):
            self.assertEqual(self.client.get(url + suffix).status_code, 422)

    def test_geocode_auth_expiry_rate_and_unavailable(self):
        url = '/v1/geocode'
        self.assertEqual(self.client.post(url, json={'query': 'synthetic'}).status_code, 401)
        self.assertEqual(self.client.post(url, headers={'X-Session-Token': 'invalid'}, json={'query': 'synthetic'}).status_code, 403)
        now = [100.]
        self.app.state.sessions = SessionStore(rate_limit=1, ttl_seconds=10, clock=lambda: now[0])
        _, headers = self.session()
        r = self.client.post(url, headers=headers, json={'query': 'synthetic'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['status'], 'ok')
        r = self.client.post(url, headers=headers, json={'query': 'synthetic'})
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.json()['error']['code'], 'rate_limited')
        now[0] += 11
        self.assertEqual(self.client.post(url, headers=headers, json={'query': 'synthetic'}).status_code, 403)
        _, headers = self.session()
        self.app.state.geocoder = fake.GoogleGeocoder(base_url=None)
        self.assertEqual(self.client.post(url, headers=headers, json={'query': 'synthetic'}).json()['status'], 'unavailable')

    def test_api_geocode_quota_validation_and_no_key_in_logs_responses(self):
        _, headers = self.session()
        self.server.status = 429
        with self.assertLogs('foodtour.access', level=logging.INFO) as logs:
            responses = [self.client.get('/health'), self.client.get('/v1/client-config'),
                self.client.post('/v1/geocode', headers=headers, json={'query': 'PRIVATE_QUERY_SENTINEL'}),
                self.client.post('/v1/geocode', headers=headers, json={'query': 'x' * 201}),
                self.client.post('/v1/geocode', headers=headers, json={'query': '  '}),
                self.client.get('/v1/geocode')]
        self.assertEqual(responses[2].json()['status'], 'quota')
        self.assertEqual(responses[3].status_code, 422)
        self.assertEqual(responses[4].status_code, 422)
        combined = '\n'.join(logs.output + [r.text for r in responses])
        self.assertNotIn(fake.KEY, combined)
        self.assertNotIn('PRIVATE_QUERY_SENTINEL', combined)
        self.assertNotIn(headers['X-Session-Token'], combined)
        for line in logs.records:
            self.assertEqual(set(json.loads(line.message)), {'request_id', 'route', 'status', 'latency_ms'})

    def test_reflected_secret_cannot_reach_geocode_response(self):
        _, headers = self.session()
        self.server.raw = {'status': 'OK', 'results': [{'formatted_address': fake.KEY,
            'geometry': {'location': {'lat': 21.0285, 'lng': 105.8522}}}]}
        r = self.client.post('/v1/geocode', headers=headers, json={'query': 'synthetic'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['status'], 'unavailable')
        self.assertNotIn(fake.KEY, r.text)

    def test_provider_tour_geometry_warnings_and_estimate_empty(self):
        s, headers = self.session()
        r = self.client.post(f"/v1/sessions/{s['session_id']}/messages", headers=headers,
            json={'text': 'quanh Ho Guom trong 4 gio, 500k moi nguoi'})
        self.assertEqual(r.status_code, 200, r.text)
        tour = r.json()['tour']
        self.assertTrue(tour['stops'], r.text)
        self.assertEqual(tour['totals']['route_provider'], 'google_routes')
        self.assertEqual(tour['route_warnings'], [fake.WALKING_WARNING])
        self.assertTrue(all(stop['leg_from_previous']['geometry'] for stop in tour['stops']))
        self.app.state.routing = StraightLineEstimator()
        r = self.client.post(f"/v1/sessions/{s['session_id']}/tour", headers=headers,
                             json={'base_revision': r.json()['revision']})
        self.assertIsNone(r.json()['tour']['totals']['route_provider'])
        self.assertEqual(r.json()['tour']['route_warnings'], [])
        self.assertTrue(all(stop['leg_from_previous']['geometry'] is None for stop in r.json()['tour']['stops']))

    def test_origin_text_resolves_and_unavailable_remains_missing(self):
        extractor = Mock()
        extractor.extract.return_value = ExtractionResult('ok', 'live', Preferences(duration_min=240), origin_text='synthetic public place')
        self.app.state.extractor = extractor
        s, headers = self.session()
        url = f"/v1/sessions/{s['session_id']}/messages"
        r = self.client.post(url, headers=headers, json={'text': 'synthetic'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['preferences']['origin_source'], 'geocoded')
        self.assertEqual(r.json()['preferences']['origin_label'], 'Synthetic public landmark')
        self.assertTrue(r.json()['notes'])
        for response in ({'status': 'ZERO_RESULTS'}, {'status': 'OVER_QUERY_LIMIT'}, {'status': 'REQUEST_DENIED'}):
            self.server.raw = response
            r = self.client.post(url, headers=headers, json={'text': 'synthetic'})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertIsNone(r.json()['preferences']['origin'])
            self.assertIn('origin', r.json()['missing_slots'])
            self.assertIsNone(r.json()['tour'])
        self.app.state.geocoder = Mock(configured=False)
        r = self.client.post(url, headers=headers, json={'text': 'synthetic'})
        self.assertIn('origin', r.json()['missing_slots'])
        self.app.state.geocoder.geocode.assert_not_called()

    def test_landmark_does_not_call_geocoder(self):
        self.app.state.geocoder = Mock(configured=True)
        s, headers = self.session()
        r = self.client.post(f"/v1/sessions/{s['session_id']}/messages", headers=headers,
            json={'text': 'quanh Ho Guom trong 4 gio, 500k moi nguoi'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['preferences']['origin_source'], 'landmark')
        self.app.state.geocoder.geocode.assert_not_called()

    def test_origin_validation_and_sqlite_restart(self):
        db = Path(self.temp.name) / 'sessions.sqlite'
        repo = VenueRepository(self.path)
        self.app.state.sessions = SQLiteSessionStore(db, repo, StraightLineEstimator())
        s, headers = self.session()
        url = f"/v1/sessions/{s['session_id']}/preferences"
        good = {'origin': {'lat': 21.0285, 'lon': 105.8522}, 'origin_label': 'Synthetic start', 'origin_source': 'manual_coordinates'}
        for bad in ({'origin_label': 'x' * 121}, {'origin_label': 'start\nsecret'},
                    {'origin_label': 'start\u200bsecret'}, {'origin_source': 'invented'}):
            r = self.client.put(url, headers=headers, json={'base_revision': 0, 'preferences': dict(good, **bad)})
            self.assertEqual(r.status_code, 422)
        r = self.client.put(url, headers=headers, json={'base_revision': 0, 'preferences': good})
        self.assertEqual(r.status_code, 200, r.text)
        self.app.state.sessions = SQLiteSessionStore(db, repo, StraightLineEstimator())
        r = self.client.get(f"/v1/sessions/{s['session_id']}", headers=headers)
        self.assertEqual(r.json()['preferences']['origin_label'], 'Synthetic start')
        self.assertEqual(r.json()['preferences']['origin_source'], 'manual_coordinates')
        r = self.client.post('/v1/geocode', headers=headers, json={'query': 'synthetic'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.client.post('/v1/geocode', headers={'X-Session-Token': 'bad'}, json={'query': 'synthetic'}).status_code, 403)

    def test_factory_google_unconfigured_no_network(self):
        with patch.dict(os.environ, {'FOODTOUR_ROUTING': 'google', 'FOODTOUR_GEOCODER': 'google', 'GOOGLE_MAPS_SERVER_KEY': ''}), \
                patch('app.providers.http_transport.build_opener', side_effect=AssertionError('network')):
            app = create_app(data_path=self.path)
            with TestClient(app) as client:
                self.assertEqual(client.get('/health').json()['routing_provider'], 'google_routes')
                self.assertFalse(client.get('/health').json()['routing_configured'])
                self.assertEqual(client.get('/v1/client-config').json()['geocoding']['status'], 'unavailable')
