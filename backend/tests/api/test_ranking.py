"""R0-6 API wiring on synthetic inputs only; no live providers."""
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.api import routes
from app.main import create_app
from app.planner import engine
from app.planner.types import Venue


class RankingAPI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'absent.json'
        self.db = Path(self.temp.name) / 'sessions.sqlite'
        env = patch.dict(os.environ, {'FOODTOUR_LLM': 'mock', 'FOODTOUR_ROUTING': 'estimate',
            'FOODTOUR_EXPLAIN': 'template', 'FOODTOUR_EVIDENCE_PATH': '', 'FOODTOUR_SESSION_DB': '',
            'FOODTOUR_RANK_QUALITY_WEIGHT': '1'})
        env.start()
        self.addCleanup(env.stop)

    def app(self, weight='1', durable=False):
        with patch.dict(os.environ, {'FOODTOUR_RANK_QUALITY_WEIGHT': weight,
                                    'FOODTOUR_SESSION_DB': str(self.db) if durable else ''}):
            return create_app(data_path=self.path)

    def ready(self, client, **prefs):
        created = client.post('/v1/sessions').json()
        url = '/v1/sessions/' + created['session_id']
        headers = {'X-Session-Token': created['token']}
        values = {'origin': {'lat': 21.03, 'lon': 105.85}, 'duration_min': 240,
                  'max_stops': 1, **prefs}
        response = client.put(url + '/preferences', headers=headers,
                              json={'base_revision': 0, 'preferences': values})
        self.assertEqual(response.status_code, 200, response.text)
        return url, headers, response.json()

    def test_preferences_persist_and_round_trip_all_enums_and_null(self):
        app = self.app(durable=True)
        with TestClient(app) as client:
            for meal in ('breakfast', 'lunch', 'snack', 'dinner', 'late', None):
                for audience in ('solo', 'friends', 'family', None):
                    with self.subTest(meal=meal, audience=audience):
                        url, headers, state = self.ready(client, meal=meal, audience=audience)
                        self.assertEqual((state['preferences']['meal'], state['preferences']['audience']),
                                         (meal, audience))
                        with closing(sqlite3.connect(self.db)) as db:
                            encoded = db.execute('SELECT preferences FROM sessions WHERE id=?',
                                                 (url.rsplit('/', 1)[1],)).fetchone()[0]
                        self.assertEqual((json.loads(encoded)['meal'], json.loads(encoded)['audience']),
                                         (meal, audience))
                        with TestClient(self.app(durable=True)) as restarted:
                            response = restarted.get(url, headers=headers)
                            self.assertEqual(response.status_code, 200, response.text)
                            self.assertEqual(response.json()['preferences'], state['preferences'])

    def test_invalid_hints_rejected_atomically(self):
        with TestClient(self.app()) as client:
            url, headers, state = self.ready(client, meal='late', audience='family')
            for field, invalid in (('meal', 'brunch'), ('audience', 'couple'), ('meal', 1), ('audience', [])):
                prefs = dict(state['preferences'], **{field: invalid})
                response = client.put(url + '/preferences', headers=headers,
                    json={'base_revision': state['revision'], 'preferences': prefs})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(client.get(url, headers=headers).json()['preferences'], state['preferences'])

    def test_invalid_weight_falls_back_and_setting_is_read_once(self):
        for raw in ('bad', '', '-1', 'nan', 'inf', '-inf', '1e999', '0', '2.5'):
            with self.subTest(raw=raw):
                app = self.app(raw)
                expected = {'0': 0.0, '2.5': 2.5}.get(raw, 1.0)
                with patch.dict(os.environ, {'FOODTOUR_RANK_QUALITY_WEIGHT': '99'}), TestClient(app) as client:
                    self.assertEqual(client.get('/health').json()['ranking'], {'quality_weight': expected})
        with patch.dict(os.environ):
            os.environ.pop('FOODTOUR_RANK_QUALITY_WEIGHT', None)
            self.assertEqual(create_app(data_path=self.path).state.quality_weight, 1.0)

    def test_weight_changes_selection_and_all_planning_endpoints_receive_it(self):
        chosen = []
        for weight in ('0', '1'):
            app = self.app(weight)
            original = app.state.venues.snapshot()
            # Explicit synthetic fixture: equal relevance, better rating slightly farther away.
            venues = tuple(Venue(id=i, name='Synthetic ' + i, lat=lat, lon=105.85,
                dish_tags=('Bún',), rating=rating, review_count=count, synthetic=True)
                for i, lat, rating, count in (('OK', 21.03, 3.2, 30), ('GOOD', 21.0302, 4.6, 300)))
            data = replace(original, venues=venues)
            with patch.object(app.state.venues, 'snapshot', return_value=data), TestClient(app) as client:
                url, headers, state = self.ready(client, interests=['bún'])
                with patch.object(routes.engine, 'plan_tour', wraps=engine.plan_tour) as planned:
                    response = client.post(url + '/tour', headers=headers, json={'base_revision': state['revision']})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(planned.call_args.kwargs['quality_weight'], float(weight))
                state = response.json()
                chosen.append(state['tour']['stops'][0]['venue_id'])
                self.assertTrue(state['tour']['stops'][0]['why'])
                self.assertTrue(all(set(reason) == {'code', 'text'} for reason in state['tour']['stops'][0]['why']))
                with patch.object(routes.engine, 'replace_stop', wraps=engine.replace_stop) as replaced:
                    response = client.post(url + '/tour/replace', headers=headers,
                        json={'base_revision': state['revision'], 'venue_id': chosen[-1]})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(replaced.call_args.kwargs['quality_weight'], float(weight))
                with patch.object(routes.engine, 'plan_tour', wraps=engine.plan_tour) as planned:
                    response = client.post(url + '/messages', headers=headers, json={'text': 'ăn tối cùng gia đình'})
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(planned.call_args.kwargs['quality_weight'], float(weight))
                    self.assertEqual(response.json()['preferences']['meal'], 'dinner')
                    self.assertEqual(response.json()['preferences']['audience'], 'family')
        self.assertEqual(chosen, ['OK', 'GOOD'])

    def test_tampered_in_memory_why_is_rebuilt_on_read(self):
        app = self.app()
        with TestClient(app) as client:
            url, headers, state = self.ready(client)
            response = client.post(url + '/tour', headers=headers, json={'base_revision': state['revision']})
            self.assertEqual(response.status_code, 200, response.text)
            expected = response.json()['tour']['stops'][0]['why']
            session = app.state.sessions._sessions[url.rsplit('/', 1)[1]]
            session.tour = replace(session.tour, stops=(replace(session.tour.stops[0],
                why=(('well_rated', 'FORGED'),)),))
            response = client.get(url, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['tour']['stops'][0]['why'], expected)
            self.assertNotIn('FORGED', response.text)

    def test_planner_why_tampering_is_rejected_before_commit(self):
        app = self.app()
        original = engine.plan_tour
        def tampered(*args, **kwargs):
            tour = original(*args, **kwargs)
            return replace(tour, stops=(replace(tour.stops[0], why=(('well_rated', 'FORGED'),)),))
        with TestClient(app) as client:
            url, headers, state = self.ready(client)
            with patch.object(routes.engine, 'plan_tour', side_effect=tampered):
                response = client.post(url + '/tour', headers=headers, json={'base_revision': state['revision']})
            self.assertEqual(response.status_code, 500, response.text)
            self.assertNotIn('FORGED', response.text)
            self.assertEqual(client.get(url, headers=headers).json()['revision'], state['revision'])

    def test_sqlite_empty_tour_restore_receives_app_weight(self):
        app = self.app('0', durable=True)
        with TestClient(app) as client:
            url, headers, state = self.ready(client, mode='strict')
            response = client.post(url + '/tour', headers=headers, json={'base_revision': state['revision']})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(response.json()['tour']['stops'])
        with TestClient(self.app('0', durable=True)) as client:
            with patch.object(engine, 'plan_tour', wraps=engine.plan_tour) as planned:
                response = client.get(url, headers=headers)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(planned.call_args.kwargs['quality_weight'], 0.0)

    def test_sqlite_tour_why_is_regenerated_and_injected_text_rejected(self):
        with TestClient(self.app(durable=True)) as client:
            url, headers, state = self.ready(client)
            response = client.post(url + '/tour', headers=headers, json={'base_revision': state['revision']})
            self.assertEqual(response.status_code, 200, response.text)
            expected = response.json()['tour']['stops'][0]['why']
        with TestClient(self.app(durable=True)) as client:
            response = client.get(url, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['tour']['stops'][0]['why'], expected)
            with closing(sqlite3.connect(self.db)) as db:
                stored = json.loads(db.execute('SELECT tour FROM sessions').fetchone()[0])
                self.assertNotIn('why', stored['stops'][0])
                stored['stops'][0]['why'] = [{'code': 'well_rated', 'text': 'FORGED'}]
                db.execute('UPDATE sessions SET tour=?', (json.dumps(stored),))
                db.commit()
            response = client.get(url, headers=headers)
            self.assertEqual(response.status_code, 503, response.text)
            self.assertNotIn('FORGED', response.text)
            self.assertNotIn('stops', response.text)
