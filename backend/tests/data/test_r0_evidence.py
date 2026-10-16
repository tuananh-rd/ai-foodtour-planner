"""Source metadata edge cases, using labelled synthetic input only."""
import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.data import aggregate_report, load_dataset
from app.data.loader import _rating, _count, _timestamp
from app.main import create_app
from tests.data.test_loader import row


class SourceEvidence(unittest.TestCase):
    def test_rating_bounds_scales_and_nonfinite(self):
        self.assertEqual(_rating(8.6, 10), (4.3, 10))
        self.assertEqual(_rating(0, 5), (0, 5))
        for value, scale in [(6, 5), (-1, 5), ('NaN', 5), ('inf', 5), (4, 0),
                             (4, -1), (4, 'NaN'), (None, 5), (4, None), (True, 5)]:
            with self.subTest(value=value, scale=scale):
                self.assertIsNone(_rating(value, scale)[0])

    def test_review_count_zero_and_invalid(self):
        for value in [0, '0', 20, '20']:
            self.assertEqual(_count(value), int(value))
        for value in [-1, '-1', 'NaN', 'inf', 2.5, None, '', True]:
            self.assertIsNone(_count(value))

    def test_timestamp_unknown_and_source_offset(self):
        self.assertEqual(_timestamp('2026-10-16T01:02:03Z'), '2026-10-16T01:02:03+00:00')
        self.assertEqual(_timestamp('2026-10-16T01:02:03+07:00'), '2026-10-16T01:02:03+07:00')
        for value in [None, '', 'bad', '2026-10-16', '2026-99-99T00:00:00']:
            self.assertIsNone(_timestamp(value))

    def test_csv_and_json_tags_and_aggregate_only(self):
        rows = [row(rating_value=8, rating_scale_max=10, review_count=0,
                    suitable_meals=' tối | trưa | tối ', audiences=' family | family ',
                    cuisine_styles=' Việt | Việt ', amenities_yes=' wifi | ghế | wifi ',
                    amenities_no='parking | parking', fetched_at='2026-10-16T00:00:00Z'),
                row('MISSING', review_count=-1)]
        with tempfile.TemporaryDirectory() as temp:
            for suffix in ['json', 'csv']:
                path = Path(temp) / ('input.' + suffix)
                if suffix == 'json':
                    path.write_text(json.dumps(rows), encoding='utf-8')
                else:
                    with path.open('w', newline='', encoding='utf-8') as handle:
                        fields = sorted(set().union(*(r.keys() for r in rows)))
                        writer = csv.DictWriter(handle, fieldnames=fields)
                        writer.writeheader()
                        writer.writerows(rows)
                data = load_dataset(path)
                venue = next(v for v in data.venues if v.id == 'TEST-001')
                self.assertEqual((venue.rating, venue.review_count), (4, 0))
                self.assertEqual(venue.suitable_meals, ('trưa', 'tối'))
                self.assertEqual(venue.audiences, ('family',))
                self.assertEqual(venue.cuisine_styles, ('Việt',))
                self.assertEqual(venue.amenities_yes, ('ghế', 'wifi'))
                self.assertEqual(venue.amenities_no, ('parking',))
                self.assertIsNone(venue.hours)
                self.assertEqual(venue.price_evidence, 'estimate')
                report = aggregate_report(data)
                for flag in ('missing_rating', 'missing_review_count', 'missing_suitable_meals'):
                    self.assertEqual(report['flags_by_reason'][flag], 1)
                for value in (venue.name, venue.source_url, venue.id):
                    self.assertNotIn(value, json.dumps(report))

    def test_evidence_in_list_detail_and_nested_stop(self):
        fixture = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.evidence.synthetic.json'
        with tempfile.TemporaryDirectory() as temp, patch('app.data.loader.SYNTHETIC_PATH', fixture):
            with TestClient(create_app(data_path=Path(temp) / 'absent.json')) as client:
                listed = client.get('/v1/venues').json()['items'][0]
                detail = client.get('/v1/venues/' + listed['id']).json()
                self.assertEqual(detail['rating'], dict(value=4.3, count=120, source_scale_max=10))
                for field in ('rating', 'suitable_meals', 'audiences', 'amenities', 'cuisine_styles', 'source_fetched_at'):
                    self.assertEqual(listed[field], detail[field])
                created = client.post('/v1/sessions').json()
                response = client.post('/v1/sessions/' + created['session_id'] + '/messages',
                    headers={'X-Session-Token': created['token']}, json={'text': 'Hồ Gươm trong 4 giờ'})
                self.assertEqual(response.status_code, 200, response.text)
                for stop in response.json()['tour']['stops']:
                    venue = client.get('/v1/venues/' + stop['venue_id']).json()
                    self.assertEqual(stop['venue'], venue)
