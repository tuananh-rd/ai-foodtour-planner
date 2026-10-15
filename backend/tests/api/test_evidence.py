import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.data.loader import ROOT
from app.main import create_app
from tests.providers.test_http import Handler


class EvidenceAPI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.overlay = Path(self.temp.name) / 'evidence.json'
        self.example = json.loads((ROOT / 'contracts/fixtures/evidence.synthetic.json').read_text(encoding='utf-8'))
        self.overlay.write_text(json.dumps(self.example), encoding='utf-8')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        self.server.mode, self.server.requests = 'ok', []
        self.server.output = b'{"code":"Ok","routes":[{"duration":60,"distance":50}]}'
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.01), daemon=True)
        self.thread.start()
        self.addCleanup(self.close)
        self.environment = patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': str(self.overlay),
            'FOODTOUR_LLM': 'mock', 'FOODTOUR_LLM_API_KEY': '', 'FOODTOUR_SESSION_DB': '',
            'FOODTOUR_ROUTING': 'osrm', 'FOODTOUR_ROUTING_ENDPOINT': 'http://127.0.0.1:' + str(self.server.server_port)})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.input = Path(self.temp.name) / 'absent.json'

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def ready(self, client, mode='strict'):
        created = client.post('/v1/sessions').json()
        url = '/v1/sessions/' + created['session_id']
        headers = {'X-Session-Token': created['token']}
        updated = client.put(url + '/preferences', headers=headers, json={'base_revision': 0,
            'preferences': {'origin': {'lat': 21.0285, 'lon': 105.8522}, 'duration_min': 240,
                'start_time': '10:00', 'weekday': 0, 'budget_vnd': 200000, 'budget_scope': 'per_person',
                'max_stops': 3, 'mode': mode}})
        self.assertEqual(updated.status_code, 200, updated.text)
        return url, headers, updated.json()['revision']

    def test_strict_overlay_and_local_osrm_fake_are_verified_end_to_end(self):
        with TestClient(create_app(data_path=self.input)) as client:
            url, headers, revision = self.ready(client)
            response = client.post(url + '/tour', headers=headers, json={'base_revision': revision})
            self.assertEqual(response.status_code, 200, response.text)
            tour = response.json()['tour']
            self.assertEqual(tour['status'], 'verified_feasible')
            self.assertEqual(len(tour['stops']), 3)
            self.assertEqual(tour['totals']['leg_source'], 'provider_route')
            self.assertTrue(all(s['price']['semantics'] == 'per_person' and s['price']['evidence'] == 'verified'
                                and s['hours']['open_at_arrival'] is True and s['synthetic'] for s in tour['stops']))
            self.assertEqual(response.json()['dataset_source'], 'synthetic')
            health = client.get('/health').json()
            self.assertEqual(health['evidence_overlay'], {'entries_loaded': 3, 'entries_rejected': 0,
                'hours_verified': 3, 'prices_verified': 3})
            self.assertNotIn('example.invalid/evidence', json.dumps(health))
            venue = client.get('/v1/venues/SYN-001').json()
            self.assertEqual(venue['price']['semantics'], 'per_person')
            self.assertEqual(venue['hours']['status'], 'verified')
            self.assertIsNone(venue['hours']['open_at_arrival'])  # Mapping is known, arrival is not supplied.
            items = client.get('/v1/venues').json()['items']
            self.assertEqual(items[0]['price_semantics'], 'per_person')
            self.assertEqual(items[0]['hours_status'], 'verified')
            self.assertEqual(items[3]['price_semantics'], 'venue_range')

    def test_default_estimate_stays_conditional_even_with_complete_overlay(self):
        with patch.dict(os.environ, {'FOODTOUR_ROUTING': 'estimate'}):
            app = create_app(data_path=self.input)
        with TestClient(app) as client:
            url, headers, revision = self.ready(client, mode='explore')
            tour = client.post(url + '/tour', headers=headers, json={'base_revision': revision}).json()['tour']
            self.assertEqual(tour['status'], 'conditional')
            self.assertIn('route', tour['unknowns'])
            self.assertEqual(tour['totals']['leg_source'], 'straight_line_estimate')

    def test_overlay_version_change_invalidates_persistent_tour_on_read(self):
        with patch.dict(os.environ, {'FOODTOUR_SESSION_DB': str(Path(self.temp.name) / 'sessions.sqlite')}):
            app = create_app(data_path=self.input)
        with TestClient(app) as client:
            url, headers, revision = self.ready(client)
            before = client.post(url + '/tour', headers=headers, json={'base_revision': revision}).json()
            self.assertEqual(before['tour']['status'], 'verified_feasible')
            current = client.get(url, headers=headers).json()
            self.assertEqual(current['tour']['status'], 'verified_feasible')
            self.example['entries'][0]['price_per_person_vnd']['max'] += 1
            self.overlay.write_text(json.dumps(self.example), encoding='utf-8')
            after = client.get(url, headers=headers).json()
            self.assertNotEqual(after['dataset_version'], before['dataset_version'])
            self.assertIsNone(after['tour'])
            self.assertEqual(after['notes'], ['dữ liệu đã đổi, hãy lập lại lịch trình'])
            self.assertEqual(after['preferences'], before['preferences'])

    def test_configured_invalid_overlay_is_redacted_503_never_cached_success(self):
        with TestClient(create_app(data_path=self.input)) as client:
            self.assertEqual(client.get('/health').status_code, 200)
            self.overlay.write_text('PRIVATE-CONTENT invalid json', encoding='utf-8')
            for url in ['/health', '/v1/venues', '/v1/venues/SYN-001']:
                response = client.get(url)
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()['error']['code'], 'provider_unavailable')
                self.assertNotIn('PRIVATE-CONTENT', response.text)
                self.assertNotIn(str(self.overlay), response.text)

    def test_in_memory_replace_cannot_reuse_stale_or_removed_verified_overlay(self):
        with TestClient(create_app(data_path=self.input)) as client:
            url, headers, revision = self.ready(client)
            state = client.post(url + '/tour', headers=headers, json={'base_revision': revision}).json()
            self.assertEqual(state['tour']['status'], 'verified_feasible')
            body = {'base_revision': state['revision'], 'venue_id': state['tour']['stops'][0]['venue_id']}
            self.overlay.write_text('invalid json', encoding='utf-8')
            self.assertEqual(client.post(url + '/tour/replace', headers=headers, json=body).status_code, 503)
            self.overlay.write_text(json.dumps(self.example) + '\n', encoding='utf-8')
            conflict = client.post(url + '/tour/replace', headers=headers, json=body)
            self.assertEqual(conflict.status_code, 409)
            self.assertEqual(conflict.json()['error']['code'], 'no_candidates')
            self.assertNotIn('stops', conflict.text)
            with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': ''}):
                self.assertEqual(client.post(url + '/tour/replace', headers=headers, json=body).status_code, 409)
