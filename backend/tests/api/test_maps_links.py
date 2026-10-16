"""Synthetic URL-only acceptance; never contact Google."""
import socket
import json
import sqlite3
import tempfile
import unittest
from dataclasses import replace
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient

from app.main import create_app
from app.planner.types import Leg, Preferences, Stop, Tour, Venue
from app.repositories.sessions import SessionStore
from app.repositories.sqlite_sessions import SQLiteSessionStore


def stops(count):
    return tuple(Stop(f"synthetic-{i}", i, Leg(None, 0, "unknown")) for i in range(1, count + 1))


def venues(count):
    return tuple(Venue(f"synthetic-{i}", "Synthetic", 21 + i / 1000, 105, synthetic=True)
                 for i in range(1, count + 1))


class MapsBuilderTests(unittest.TestCase):
    def build(self, count=3, data=None, origin=(21, 105), mode="walking"):
        from app.planner.maps_url import build_maps_links
        return build_maps_links(origin, None, stops(count), venues(count) if data is None else data, mode)

    def queries(self, result):
        for i, link in enumerate(result['links'], 1):
            parts = urlsplit(link['url'])
            self.assertEqual((parts.scheme, parts.netloc, parts.path),
                             ('https', 'www.google.com', '/maps/dir/'))
            query = parse_qs(parts.query)
            self.assertEqual(query['api'], ['1'])
            self.assertEqual(query['travelmode'], [result['travelmode']])
            self.assertNotIn('dir_action', query)
            self.assertLessEqual(link['waypoint_count'], 3)
            self.assertEqual(link['url_length'], len(link['url']))
            self.assertLessEqual(link['url_length'], 2048)
            self.assertEqual((link['index'], link['of']), (i, len(result['links'])))
            self.assertEqual(len(link['point_kinds']), link['waypoint_count'] + 2)
            yield query

    def test_order_modes_and_mobile_splitting_one_through_twelve(self):
        for count in range(1, 13):
            for mode in ('walking', 'driving'):
                with self.subTest(count=count, mode=mode):
                    result = self.build(count, mode=mode)
                    self.assertEqual(result['status'], 'ok')
                    actual = []
                    previous = None
                    for query in self.queries(result):
                        if previous is None:
                            actual.append(query['origin'][0])
                        else:
                            self.assertEqual(query['origin'][0], previous)
                        actual.extend(query.get('waypoints', [''])[0].split('|') if 'waypoints' in query else [])
                        actual.append(query['destination'][0])
                        previous = query['destination'][0]
                    self.assertEqual(actual, ['21.000000,105.000000'] +
                                     [f'{21 + i / 1000:.6f},105.000000' for i in range(1, count + 1)])
                    self.assertIsNone(result['links'][0]['from_stop'])
                    self.assertEqual(result['links'][-1]['to_stop'], count)

    def test_address_encoding_normalisation_and_coordinate_precedence(self):
        address = '  12\tPhố Huế & Bún + Chè #1? / Hà Nội\n\x00\u200b '
        data = (replace(venues(1)[0], lat=None, address=address),)
        result = self.build(1, data)
        query = list(self.queries(result))[0]
        self.assertEqual(query['destination'], ['12 Phố Huế & Bún + Chè #1? / Hà Nội'])
        self.assertEqual(result['links'][0]['point_kinds'], ['latlng', 'address'])
        self.assertIn('%26', result['links'][0]['url'])
        self.assertIn('%2B', result['links'][0]['url'])
        result = self.build(1, (replace(venues(1)[0], address=address),))
        self.assertEqual(result['links'][0]['point_kinds'], ['latlng', 'latlng'])

    def test_invalid_coordinates_fallback_or_explicit_skip(self):
        for lat, lon in ((None, 105), (float('nan'), 105), (21, float('inf')),
                         (91, 105), (21, -181), ('bad', 105), (True, 105)):
            with self.subTest(lat=lat, lon=lon):
                data = (replace(venues(1)[0], lat=lat, lon=lon, address=' Synthetic address '),)
                self.assertEqual(self.build(1, data)['links'][0]['point_kinds'][-1], 'address')
        data = list(venues(4))
        data[1] = replace(data[1], lat=None, address='')
        result = self.build(4, data)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['skipped'], [{'stop_order': 2, 'venue_id': 'synthetic-2',
                                              'reason': 'no_usable_point'}])
        self.assertEqual([(v['from_stop'], v['to_stop']) for v in result['links']], [(None, 1), (3, 4)])
        self.assertEqual(self.build(1, (replace(venues(1)[0], lat=None),))['status'], 'unavailable')

    def test_length_shrinks_waypoints_and_rejects_unencodable_pairs(self):
        data = tuple(replace(v, lat=None, address='ế' * 190 + str(i)) for i, v in enumerate(venues(5)))
        result = self.build(5, data)
        list(self.queries(result))
        self.assertTrue(result['skipped'])
        self.assertTrue(all(s['reason'] == 'url_too_long' for s in result['skipped']))
        data = tuple(replace(v, lat=None, address='ế' * 75 + str(i)) for i, v in enumerate(venues(5)))
        result = self.build(5, data)
        list(self.queries(result))
        self.assertEqual(result['status'], 'ok')
        self.assertGreater(len(result['links']), 2)
        self.assertTrue(all(v['waypoint_count'] < 3 for v in result['links']))

    def test_address_cap_privacy_origin_fallback_and_no_network(self):
        from app.planner.maps_url import build_maps_links
        with patch.object(socket.socket, 'connect', side_effect=AssertionError('outbound network')):
            result = build_maps_links(None, 'Synthetic start', stops(1),
                                      (replace(venues(1)[0], lat=None, address='a' * 400),), 'walking')
        query = list(self.queries(result))[0]
        self.assertEqual(query['origin'], ['Synthetic start'])
        self.assertEqual(query['destination'], ['a' * 200])
        self.assertTrue(any('only when' in note and 'Google' in note for note in result['notes']))
        self.assertFalse(result['uses_api'])
        self.assertEqual(result['provider'], 'google_maps_urls')

    def test_isolated_run_and_no_usable_points(self):
        data = (replace(venues(2)[0], lat=None), venues(2)[1])
        result = self.build(2, data)
        self.assertEqual(result['status'], 'partial')
        query = list(self.queries(result))[0]
        self.assertEqual(query['origin'], query['destination'])
        self.assertEqual(result['links'][0]['from_stop'], 2)
        result = self.build(2, tuple(replace(v, lat=None) for v in venues(2)))
        self.assertEqual(result['status'], 'unavailable')
        self.assertEqual(result['links'], [])
        self.assertEqual([s['stop_order'] for s in result['skipped']], [1, 2])

    def test_frontend_fixtures_match_builder_and_schema(self):
        from app.api.schemas import MapsLinksResponse
        from app.planner.maps_url import build_maps_links
        path = Path(__file__).resolve().parents[3] / 'contracts/fixtures/maps_links.synthetic.json'
        fixture = json.loads(path.read_text(encoding='utf-8'))
        self.assertTrue(fixture['synthetic'])
        for case in fixture['cases']:
            given = case['input']
            result = build_maps_links(given['origin'], given['origin_address'],
                tuple(Stop(s['venue_id'], s['order'], Leg(None, 0, 'unknown')) for s in given['stops']),
                tuple(Venue(**v) for v in given['venues']), given['mode'])
            self.assertEqual(result, case['response'], case['name'])
            MapsLinksResponse.model_validate(result)


class MapsEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = SessionStore()
        self.app = create_app(data_path=Path(self.temp.name) / 'absent.json', sessions=self.store)
        self.client = self.enterContext(TestClient(self.app))

    def test_auth_no_tour_readonly_and_no_providers(self):
        created = self.client.post('/v1/sessions').json()
        url = f"/v1/sessions/{created['session_id']}/tour/maps-links"
        headers = {'X-Session-Token': created['token']}
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.get(url, headers={'X-Session-Token': 'wrong'}).status_code, 403)
        response = self.client.get(url, headers=headers)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'no_tour')
        self.store._sessions[created['session_id']].tour = Tour('no_solution')
        self.assertEqual(self.client.get(url, headers=headers).status_code, 409)
        state = self.client.post(f"/v1/sessions/{created['session_id']}/messages", headers=headers,
                                json={'text': 'quanh Hồ Gươm trong 4 giờ, 500k mỗi người'}).json()
        self.assertTrue(state['tour']['stops'])
        before = self.store._sessions[created['session_id']]
        saved = (before.revision, before.preferences, before.tour, before.snapshot)
        with patch.object(socket.socket, 'connect', side_effect=AssertionError('outbound network')), \
                patch.object(self.app.state.routing, 'leg', side_effect=AssertionError('routing')), \
                patch.object(self.app.state.explainer, 'explain', side_effect=AssertionError('explanation')):
            response = self.client.get(url, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), self.client.get(url, headers=headers).json())
            self.assertEqual(self.client.get(url + '?mode=driving', headers=headers).json()['travelmode'], 'driving')
        self.assertEqual(saved, (before.revision, before.preferences, before.tour, before.snapshot))
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(self.client.get(url + '?mode=bicycling', headers=headers).status_code, 422)

    def test_sqlite_restore_does_not_replan_or_change_persisted_tour(self):
        store = SQLiteSessionStore(Path(self.temp.name) / 'session.sqlite', self.app.state.venues, self.app.state.routing)
        self.app.state.sessions = store
        created = self.client.post('/v1/sessions').json()
        headers = {'X-Session-Token': created['token']}
        base = f"/v1/sessions/{created['session_id']}"
        state = self.client.post(base + '/messages', headers=headers,
                                json={'text': 'quanh Hồ Gươm trong 4 giờ, 500k mỗi người'}).json()
        self.assertTrue(state['tour']['stops'])
        with closing(sqlite3.connect(store.path)) as db:
            before = db.execute('SELECT preferences,revision,tour,expires_at FROM sessions').fetchall()
        with patch.object(socket.socket, 'connect', side_effect=AssertionError('outbound network')), \
                patch('app.repositories.sqlite_sessions.engine.build_tour', side_effect=AssertionError('replan')), \
                patch('app.repositories.sqlite_sessions.engine.plan_tour', side_effect=AssertionError('replan')):
            result = self.client.get(base + '/tour/maps-links', headers=headers)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['status'], 'ok')
        with closing(sqlite3.connect(store.path)) as db:
            self.assertEqual(before, db.execute('SELECT preferences,revision,tour,expires_at FROM sessions').fetchall())
