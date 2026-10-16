"""C0-HF API regressions; all data is explicitly synthetic and providers are local."""
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.data.loader import SYNTHETIC_PATH
from app.llm.extract import MockExtractor
from app.main import create_app
from app.planner import engine


class AllergyAPI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / 'sessions.sqlite'
        self.env = patch.dict(os.environ, {'FOODTOUR_SESSION_DB': str(self.db), 'FOODTOUR_LLM': 'rules',
                                          'FOODTOUR_ROUTING': 'estimate'})
        self.env.start()
        self.addCleanup(self.env.stop)
        # Extend the existing synthetic fixture with explicit allergen candidates, so exclusion
        # and replacement assertions cannot pass merely because the input had no crab venues.
        payload = json.loads(SYNTHETIC_PATH.read_text(encoding='utf-8'))
        for i, name in enumerate(('Cua bien', 'Lau hai san'), 901):
            row = dict(payload['venues'][0], id=f'SYN-{i}', name=f'[SYNTHETIC] {name}',
                       dish_tags=['hai san'], lat=21.0286, lon=105.8521)
            payload['venues'].append(row)
        self.data = Path(self.temp.name) / 'synthetic.json'
        self.data.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
        self.app, self.client = self.restart()
        self.session = self.client.post('/v1/sessions').json()
        self.url = '/v1/sessions/' + self.session['session_id']
        self.headers = {'X-Session-Token': self.session['token']}

    def restart(self):
        app = create_app(data_path=self.data, extractor=MockExtractor())
        client = TestClient(app)
        self.addCleanup(client.close)
        return app, client

    def message(self, text):
        response = self.client.post(self.url + '/messages', headers=self.headers, json={'text': text})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def ready(self):
        return self.message('Ho Guom 4 gio, nhom 3 nguoi')

    def safe_tour(self, state):
        from app.planner.allergens import allergen_excluded
        tour = state['tour']
        self.assertTrue(tour['stops'])
        self.assertEqual(tour['status'], 'conditional')
        self.assertIn('allergy_ingredients', tour['unknowns'])
        venues = {v.id: v for v in self.app.state.venues.snapshot().venues}
        for stop in tour['stops']:
            self.assertFalse(allergen_excluded(venues[stop['venue_id']], ('cua',)))

    def test_message_allergy_party_budget_and_warning(self):
        self.ready()
        state = self.message('tôi dị ứng cua, 4 người, 600k cả nhóm')
        self.assertEqual(state['preferences']['allergies'], ['cua'])
        self.assertEqual(state['preferences']['party_size'], 4)
        self.assertEqual(state['preferences']['budget_vnd'], 600000)
        self.assertEqual(state['preferences']['budget_scope'], 'group')
        self.assertTrue(any('không quán nào được xác nhận an toàn' in n for n in state['notes']))
        self.safe_tour(state)

    def test_party_edit(self):
        self.assertEqual(self.ready()['preferences']['party_size'], 3)
        self.assertEqual(self.message('đổi thành 4 người')['preferences']['party_size'], 4)

    def test_bare_avoidance_clarifies(self):
        state = self.message('không ăn cua')
        self.assertIn('cua', state['preferences']['exclusions'])
        self.assertEqual(state['preferences']['allergies'], [])
        self.assertTrue(any('dị ứng hay chỉ là không thích' in n for n in state['notes']))

    def test_restart_retains_allergy_and_validates_restored_tour(self):
        self.ready()
        before = self.message('dị ứng cua')
        self.app, self.client = self.restart()
        response = self.client.get(self.url, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        state = response.json()
        self.assertEqual(state['preferences']['allergies'], ['cua'])
        self.assertEqual([s['venue_id'] for s in state['tour']['stops']],
                         [s['venue_id'] for s in before['tour']['stops']])
        self.safe_tour(state)
        with self.app.state.sessions.owned(self.session['session_id'], self.session['token']) as restored:
            self.assertEqual(engine.validate_tour(restored.tour, restored.snapshot.venues,
                                                 restored.preferences, self.app.state.routing), [])

    def test_old_session_without_allergies_loads(self):
        self.ready()
        with closing(sqlite3.connect(self.db)) as db, db:
            encoded = json.loads(db.execute('SELECT preferences FROM sessions').fetchone()[0])
            encoded.pop('allergies', None)
            db.execute('UPDATE sessions SET preferences=?', (json.dumps(encoded),))
        self.app, self.client = self.restart()
        response = self.client.get(self.url, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['preferences']['allergies'], [])
        self.assertTrue(response.json()['tour']['stops'])

    def test_replace_excludes_allergen_candidates(self):
        self.ready()
        state = self.message('dị ứng cua')
        response = self.client.post(self.url + '/tour/replace', headers=self.headers,
            json={'base_revision': state['revision'], 'venue_id': state['tour']['stops'][0]['venue_id']})
        self.assertEqual(response.status_code, 200, response.text)
        self.safe_tour(response.json())

    def test_put_allergies_round_trip_and_strip(self):
        response = self.client.put(self.url + '/preferences', headers=self.headers,
            json={'base_revision': 0, 'preferences': {'allergies': ['  cua  ', 'sữa']}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['preferences']['allergies'], ['cua', 'sữa'])
        self.app, self.client = self.restart()
        self.assertEqual(self.client.get(self.url, headers=self.headers).json()['preferences']['allergies'],
                         ['cua', 'sữa'])

    def test_put_invalid_allergies_returns_422(self):
        for value in (None, 'cua', [1], [''], ['  '], ['x' * 41], ['cua'] * 11,
                      ['cua\n'], ['\tcua'], ['c\u200bua'], ['c\ud800ua'], ['c\x7fua']):
            with self.subTest(value=repr(value)):
                response = self.client.put(self.url + '/preferences',
                    content=json.dumps({'base_revision': 0, 'preferences': {'allergies': value}}),
                    headers=dict(self.headers, **{'Content-Type': 'application/json'}))
                self.assertEqual(response.status_code, 422, response.text)
                self.assertNotIn('input', response.json()['error'])


if __name__ == '__main__':
    unittest.main()
