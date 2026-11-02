"""Synthetic URL-only acceptance; never contact a routing provider."""
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
    def build(self, count=3, data=None, origin=(21,105), mode='walking', vehicle=None):
        from app.planner.maps_url import build_maps_links
        return build_maps_links(origin, 'Never geocode this address', stops(count),
            venues(count) if data is None else data, mode, vehicle)

    def test_order_and_modes_one_through_twelve_without_network(self):
        from app.api.schemas import MapsLinksResponse
        with patch.object(socket.socket,'connect',side_effect=AssertionError('network')):
            for count in range(1,13):
                for mode,engine in [('walking','fossgis_osrm_foot'),('driving','fossgis_osrm_car')]:
                    result=self.build(count,mode=mode)
                    MapsLinksResponse.model_validate(result)
                    self.assertEqual(result['status'],'ok')
                    self.assertEqual(len(result['links']),count)
                    previous='21.000000,105.000000'
                    for i,link in enumerate(result['links'],1):
                        u=urlsplit(link['url']);q=parse_qs(u.query)
                        self.assertEqual((u.scheme,u.netloc,u.path),('https','www.openstreetmap.org','/directions'))
                        self.assertEqual(q['engine'],[engine])
                        a,b=q['route'][0].split(';')
                        self.assertEqual(a,previous)
                        self.assertEqual(b,f'{21+i/1000:.6f},105.000000')
                        self.assertEqual((link['index'],link['of'],link['to_stop']),(i,count,i))
                        self.assertEqual(link['from_stop'],i-1 if i>1 else None)
                        self.assertEqual(link['waypoint_count'],0)
                        self.assertLessEqual(len(link['url']),2048)
                        previous=b

    def test_missing_coordinate_never_address_guessed_or_bridged(self):
        data=list(venues(4));data[1]=replace(data[1],lat=None,address='Synthetic address')
        result=self.build(4,data)
        self.assertEqual(result['status'],'partial')
        self.assertEqual([(l['from_stop'],l['to_stop']) for l in result['links']],[(None,1),(3,4)])
        self.assertEqual(result['skipped'][0]['stop_order'],2)
        for invalid in (None,True,float('nan'),float('inf'),91,'21'):
            self.assertEqual(self.build(1,[replace(venues(1)[0],lat=invalid)])['links'],[])

    def test_origin_required_and_no_mode_substitution(self):
        self.assertEqual(self.build(origin=None)['links'],[])
        self.assertEqual(self.build(mode='driving',vehicle='motorbike')['links'],[])
        self.assertEqual(self.build(mode='driving',vehicle='walk')['links'],[])
        self.assertEqual(self.build(mode='walking',vehicle='car')['links'],[])
        self.assertTrue(self.build(mode='walking',vehicle='walk')['links'])
        self.assertTrue(self.build(mode='driving',vehicle='taxi')['links'])
        self.assertFalse(self.build()['uses_api'])
        self.assertEqual(self.build()['provider'],'openstreetmap_urls')

    def test_shared_client_fixtures_match_osm_contract(self):
        from app.api.schemas import MapsLinksResponse
        from app.planner.maps_url import build_maps_links
        fixture=json.loads((Path(__file__).resolve().parents[3]/
            'contracts/fixtures/maps_links.synthetic.json').read_text(encoding='utf-8'))
        self.assertTrue(fixture['synthetic'])
        for case in fixture['cases']:
            given=case['input']
            result=build_maps_links(given['origin'],given['origin_address'],
                tuple(Stop(s['venue_id'],s['order'],Leg(None,0,'unknown')) for s in given['stops']),
                tuple(Venue(**v) for v in given['venues']),given['mode'])
            self.assertEqual(result,case['response'],case['name'])
            MapsLinksResponse.model_validate(result)


class MapsEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = SessionStore()
        self.app = create_app(data_path=Path(self.temp.name) / 'absent.json', sessions=self.store)
        self.client = self.enterContext(TestClient(self.app))

    def test_health_menu_counts_only_no_records(self):
        data=self.app.state.venues.snapshot()
        with patch.object(self.app.state.venues,'snapshot',return_value=replace(data,
                menu_counts={'food_rows':12,'price_quarantined':2})):
            result=self.client.get('/health')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['menu_counts'],{'food_rows':12,'price_quarantined':2})
        self.assertNotIn('menu_by_venue',result.json())

    def test_confirmed_motorcycle_cannot_be_relabelled_as_car(self):
        created=self.client.post('/v1/sessions').json()
        headers={'X-Session-Token':created['token']}
        base=f"/v1/sessions/{created['session_id']}"
        self.client.post(base+'/messages',headers=headers,
                         json={'text':'quanh Hồ Gươm trong 4 giờ, 500k mỗi người'})
        session=self.store._sessions[created['session_id']]
        self.assertTrue(session.tour.stops)
        session.tour_vehicle='motorbike'
        result=self.client.get(base+'/tour/maps-links?mode=driving',headers=headers)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['status'],'unavailable')
        self.assertEqual(result.json()['links'],[])
        self.assertTrue(any('Motorcycle' in n for n in result.json()['notes']))
        self.assertEqual(session.tour_vehicle,'motorbike')

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
