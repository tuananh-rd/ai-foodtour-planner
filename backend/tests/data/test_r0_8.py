"""R0-8: explicitly configured synthetic data and private provenance regressions."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.data import load_dataset
from app.data.loader import ROOT, SYNTHETIC_PATH
from app.main import create_app
from tests.data.test_loader import row


class ConfiguredDatasetTests(unittest.TestCase):
    def test_explicit_evidence_wrapper_loads_canonical_fields(self):
        ds = load_dataset(ROOT / 'contracts/fixtures/venues.evidence.synthetic.json')
        self.assertEqual(ds.dataset_source, 'synthetic')
        self.assertEqual(len(ds.venues), 13)
        self.assertTrue(all(v.synthetic for v in ds.venues))
        self.assertEqual(ds.venues[0].dish_tags, ('bún', 'chả'))
        self.assertEqual(ds.venues[0].price_min_vnd, 20000)
        self.assertEqual(ds.venues[0].rating, 4.3)

    def test_relative_environment_path_is_repo_relative(self):
        with patch.dict(os.environ, {'FOODTOUR_DATA_PATH': 'contracts/fixtures/venues.evidence.synthetic.json'}):
            self.assertEqual(load_dataset().dataset_source, 'synthetic')
            with TestClient(create_app()) as client:
                self.assertEqual(client.get('/health').status_code, 200)

    def test_provenance_across_health_session_and_venue_mapping(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'synthetic-name-is-not-evidence.json'
            cases = [
                ([row()], 'private', False),
                ({'_label': 'private input', 'venues': [row()]}, 'private', False),
                ([row(synthetic=True)], 'synthetic', True),
                ({'synthetic': True, 'venues': [row()]}, 'synthetic', True),
                ({'_label': 'SYNTHETIC test fixtures.', 'venues': [row()]}, 'synthetic', True),
                ({'_label': 'SYNTHETIC', 'venues': [row()]}, 'synthetic', True),
                ([row('A', synthetic=True), row('B')], 'private', True),
                ([row(synthetic='true')], 'private', False),
                ({'_label': 'not synthetic', 'venues': [row()]}, 'private', False),
            ]
            for document, source, first_synthetic in cases:
                with self.subTest(source=source, document=document):
                    path.write_text(json.dumps(document), encoding='utf-8')
                    ds = load_dataset(path)
                    self.assertEqual(ds.dataset_source, source)
                    self.assertEqual(ds.venues[0].synthetic, first_synthetic)
                    self.assertEqual(ds.venues[0].price_min_vnd, 10000)
                    with TestClient(create_app(data_path=path)) as client:
                        health = client.get('/health')
                        self.assertEqual(health.status_code, 200)
                        self.assertEqual(health.json()['dataset_source'], source)
                        session = client.post('/v1/sessions', json={})
                        self.assertEqual(session.status_code, 200)
                        created = session.json()
                        state = client.get('/v1/sessions/' + created['session_id'],
                                           headers={'X-Session-Token': created['token']})
                        self.assertEqual(state.status_code, 200)
                        self.assertEqual(state.json()['dataset_source'], source)
                        listing = client.get('/v1/venues').json()
                        self.assertEqual(listing['dataset_source'], source)
                        self.assertEqual(listing['items'][0]['synthetic'], first_synthetic)

    def test_empty_wrapper_and_canonical_private_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'synthetic.json'
            path.write_text('{"venues": []}', encoding='utf-8')
            self.assertEqual(load_dataset(path).dataset_source, 'private')
            self.assertEqual(load_dataset(path).venues, ())
            rows = json.loads(SYNTHETIC_PATH.read_text(encoding='utf-8'))['venues']
            for item in rows:
                item.pop('synthetic')
            path.write_text(json.dumps(rows), encoding='utf-8')
            ds = load_dataset(path)
            self.assertEqual(ds.dataset_source, 'private')
            self.assertTrue(all(not v.synthetic for v in ds.venues))
            self.assertEqual(ds.venues[0].price_min_vnd, 20000)

    def test_default_fixture_varied_rating_and_fit_evidence(self):
        ds = load_dataset(SYNTHETIC_PATH)
        self.assertEqual(len(ds.venues), 13)
        self.assertTrue(any(v.rating is not None and v.review_count < 5 for v in ds.venues))
        self.assertTrue(any(v.rating is not None and v.review_count >= 20 for v in ds.venues))
        self.assertTrue(any(v.rating is None and v.review_count is None for v in ds.venues))
        self.assertGreater(len({v.suitable_meals for v in ds.venues}), 2)
        self.assertGreater(len({v.audiences for v in ds.venues}), 2)
