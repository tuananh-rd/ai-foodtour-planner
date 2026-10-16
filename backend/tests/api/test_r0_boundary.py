"""R0-7 API boundary regressions; all venue input is labelled synthetic."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.schemas import Rating
from app.data.loader import _count
from app.main import create_app


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        env = patch.dict(os.environ, {
            'FOODTOUR_LLM': 'mock', 'FOODTOUR_EXPLAIN': 'template',
            'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_GEOCODER': '',
            'FOODTOUR_SESSION_DB': '', 'FOODTOUR_EVIDENCE_PATH': '',
        })
        env.start()
        self.addCleanup(env.stop)

    def test_client_config_ui_v2_unset_zero_one_and_aliases(self):
        with TestClient(create_app(data_path=Path(self.temp.name) / 'absent.json')) as client:
            for value, expected in [(None, False), ('0', False), ('1', True),
                                    ('true', True), ('yes', True), (' TRUE ', True),
                                    ('false', False), ('', False), ('on', False)]:
                with self.subTest(value=value), patch.dict(os.environ):
                    os.environ.pop('FOODTOUR_UI_V2', None)
                    if value is not None:
                        os.environ['FOODTOUR_UI_V2'] = value
                    response = client.get('/v1/client-config')
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json().get('features'), {'ui_v2': expected, 'chat_v2': False})

    def test_rating_rounds_in_list_detail_and_nested_stop(self):
        fixture = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.evidence.synthetic.json'
        document = json.loads(fixture.read_text(encoding='utf-8'))
        rows = document['venues']
        expected = {}
        for i, row in enumerate(rows):
            row['rating_value'] = 7.2 if i % 2 == 0 else 8.2469
            row['rating_scale_max'] = 10
            expected[row['id']] = 3.6 if i % 2 == 0 else 4.12
        source = Path(self.temp.name) / 'venues.synthetic.json'
        source.write_text(json.dumps(document), encoding='utf-8')
        with patch('app.data.loader.SYNTHETIC_PATH', source):
            with TestClient(create_app(data_path=Path(self.temp.name) / 'absent.json')) as client:
                listed = client.get('/v1/venues').json()['items']
                self.assertTrue(listed)
                for venue in listed:
                    with self.subTest(surface='list', venue=venue['id']):
                        self.assertEqual(venue['rating']['value'], expected[venue['id']])
                    detail = client.get('/v1/venues/' + venue['id']).json()
                    with self.subTest(surface='detail', venue=venue['id']):
                        self.assertEqual(detail['rating']['value'], expected[venue['id']])
                session = client.post('/v1/sessions').json()
                response = client.post('/v1/sessions/' + session['session_id'] + '/messages',
                    headers={'X-Session-Token': session['token']},
                    json={'text': 'Hồ Gươm trong 4 giờ'})
                self.assertEqual(response.status_code, 200, response.text)
                stops = response.json()['tour']['stops']
                self.assertTrue(stops)
                for stop in stops:
                    with self.subTest(surface='stop', venue=stop['venue_id']):
                        self.assertEqual(stop['venue']['rating']['value'], expected[stop['venue_id']])

    def test_count_bound_loader_and_api_schema(self):
        for value in ['1e400', '10000001']:
            with self.subTest(value=value):
                self.assertIsNone(_count(value))
        self.assertEqual(_count('10000000'), 10_000_000)
        self.assertEqual(Rating(count=10_000_000).count, 10_000_000)
        self.assertIsNone(Rating().value)
        with self.assertRaises(ValidationError):
            Rating(count=10_000_001)
