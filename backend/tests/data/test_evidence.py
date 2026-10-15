import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.data import DatasetLoadError, aggregate_report, load_dataset
from app.data.loader import ROOT, SYNTHETIC_PATH
from app.data.evidence import MAX_BYTES
from app.planner.engine import plan_tour, validate_tour
from app.planner.interfaces import StraightLineEstimator
from app.planner.types import Leg, Preferences
from app.repositories.venues import VenueRepository

FIXTURE = ROOT / 'contracts/fixtures/evidence.synthetic.json'


def example():
    return json.loads(FIXTURE.read_text(encoding='utf-8'))


class FakeVerifiedRoutes:
    def leg(self, a, b):
        return Leg(1, .05, 'provider_route')


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.input = Path(self.temp.name) / 'absent.json'
        self.overlay = Path(self.temp.name) / 'evidence.json'
        environment = patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': ''})
        environment.start()
        self.addCleanup(environment.stop)

    def load(self, entries):
        self.overlay.write_text(json.dumps({'schema': 1, 'entries': entries}), encoding='utf-8')
        with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': str(self.overlay)}):
            return load_dataset(self.input)

    def test_unset_or_blank_is_identical_to_original_dataset(self):
        original = load_dataset(self.input)
        self.assertEqual(original.dataset_version, hashlib.sha256(SYNTHETIC_PATH.read_bytes()).hexdigest())
        for blank in ['', '  \t ']:
            with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': blank}):
                self.assertEqual(load_dataset(self.input), original)
        self.assertEqual(set(original.evidence_overlay.values()), {0})

    def test_valid_fixture_merges_minutes_prices_and_count_only_report(self):
        with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': str(FIXTURE)}):
            ds = load_dataset(self.input)
        self.assertEqual(ds.evidence_overlay, {'entries_loaded': 3, 'entries_rejected': 0,
            'hours_verified': 3, 'prices_verified': 3})
        v = ds.venues[0]
        self.assertEqual(v.hours[0], [(480, 1320)])
        self.assertEqual(v.hours[6], [])
        self.assertIn('08:00', v.hours_display)
        self.assertEqual((v.price_min_vnd, v.price_max_vnd, v.price_evidence), (10000, 20000, 'verified'))
        self.assertTrue(v.synthetic)
        self.assertEqual(ds.dataset_source, 'synthetic')
        serialized = json.dumps(aggregate_report(ds))
        for value in [v.id, v.name, v.address, v.source_url, str(FIXTURE), example()['entries'][0]['hours_source']]:
            self.assertNotIn(value, serialized)

    def test_partial_field_is_loaded_and_rejected_without_promoting_price(self):
        entry = example()['entries'][0]
        del entry['price_source']
        ds = self.load([entry])
        self.assertEqual(ds.evidence_overlay, {'entries_loaded': 1, 'entries_rejected': 1,
            'hours_verified': 1, 'prices_verified': 0})
        self.assertEqual(ds.venues[0].price_evidence, 'estimate')
        self.assertEqual(ds.venues[0].price_max_vnd, 45000)
        self.assertEqual(ds.evidence_rejections, {'invalid_price_evidence': 1})

    def test_fields_require_independent_source_and_valid_date(self):
        for key in ['hours_source', 'hours_verified_at', 'price_source', 'price_verified_at']:
            for bad in [None, '', '  ', 123]:
                with self.subTest(key=key, bad=bad):
                    entry = example()['entries'][0]
                    entry[key] = bad
                    ds = self.load([entry])
                    self.assertEqual(ds.evidence_overlay['entries_rejected'], 1)
                    self.assertEqual(ds.evidence_overlay['entries_loaded'], 1)
        for bad in ['2026-02-30', '2026-1-01', 'not-a-date']:
            entry = example()['entries'][0]
            entry['hours_verified_at'] = entry['price_verified_at'] = bad
            self.assertEqual(self.load([entry]).evidence_overlay['entries_loaded'], 0)

    def test_invalid_times_overlap_reverse_and_partial_week_rejected(self):
        invalid = [[['25:00', '26:00']], [['8:00', '22:00']], [['08:60', '22:00']],
                   [['22:00', '08:00']], [['08:00', '08:00']], [['08:00', '12:00'], ['11:00', '13:00']],
                   [['08:00', '12:00'], ['08:00', '12:00']], [['08:00']], [None], '08:00-22:00']
        for intervals in invalid:
            entry = example()['entries'][0]
            entry['hours']['0'] = intervals
            ds = self.load([entry])
            self.assertIsNone(ds.venues[0].hours)
            self.assertEqual(ds.evidence_overlay['hours_verified'], 0)
            self.assertEqual(ds.evidence_overlay['prices_verified'], 1)
        for value in [{'0': [['08:00', '22:00']]}, {'7': []}, None, []]:
            entry = example()['entries'][0]
            entry['hours'] = value
            self.assertEqual(self.load([entry]).evidence_rejections, {'invalid_hours_evidence': 1})

    def test_adjacent_unsorted_intervals_and_verified_closed_days(self):
        entry = example()['entries'][0]
        entry['hours']['0'] = [['12:00', '22:00'], ['08:00', '12:00']]
        ds = self.load([entry])
        self.assertEqual(ds.venues[0].hours[0], [(480, 1320)])
        self.assertEqual(ds.venues[0].hours[6], [])

    def test_price_type_order_and_negative_values_rejected(self):
        for price in [{'min': -1, 'max': 5}, {'min': 6, 'max': 5}, {'min': True, 'max': 5},
                      {'min': 1.5, 'max': 5}, {'min': '1', 'max': 5}, {'min': 1},
                      {'min': 1, 'max': 5, 'semantics': 'venue_range'}, None]:
            entry = example()['entries'][0]
            entry['price_per_person_vnd'] = price
            ds = self.load([entry])
            self.assertEqual(ds.venues[0].price_evidence, 'estimate')
            self.assertEqual(ds.evidence_overlay['prices_verified'], 0)
        # Explicitly attested zero is a known free per-person price; raw source zero remains unknown.
        entry = example()['entries'][0]
        entry['price_per_person_vnd'] = {'min': 0, 'max': 0}
        self.assertEqual(self.load([entry]).venues[0].price_evidence, 'verified')

    def test_unknown_and_all_duplicate_id_entries_rejected_rest_loads(self):
        entries = example()['entries']
        duplicate = copy.deepcopy(entries[0])
        unknown = copy.deepcopy(entries[1])
        unknown['venue_id'] = 'UNKNOWN-CONTENT-DO-NOT-ECHO'
        ds = self.load([entries[0], unknown, duplicate, entries[2]])
        self.assertEqual(ds.evidence_overlay['entries_loaded'], 1)
        self.assertEqual(ds.evidence_overlay['entries_rejected'], 3)
        self.assertEqual(ds.evidence_rejections, {'duplicate_venue_id': 2, 'unknown_venue_id': 1})
        self.assertEqual(ds.venues[0].price_evidence, 'estimate')
        self.assertNotIn(unknown['venue_id'], json.dumps(aggregate_report(ds)))

    def test_invalid_rows_do_not_prevent_other_entries_loading(self):
        ds = self.load([None, 5, {'venue_id': 1}, {'venue_id': ''}, {'venue_id': 'SYN-002'},
                        {'venue_id': 'SYN-003', 'unexpected': 'PRIVATE'}, example()['entries'][0]])
        self.assertEqual(ds.evidence_overlay['entries_loaded'], 1)
        self.assertEqual(ds.evidence_overlay['entries_rejected'], 6)
        self.assertNotIn('PRIVATE', json.dumps(aggregate_report(ds)))

    def test_unreadable_malformed_oversized_and_relative_files_fail_closed(self):
        for text in ['not json', '[]', '{"schema":true,"entries":[]}', '{"schema":2,"entries":[]}',
                     '{"schema":1,"entries":{}}', '{"schema":1,"schema":1,"entries":[]}']:
            self.overlay.write_text(text, encoding='utf-8')
            with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': str(self.overlay)}), self.assertRaises(DatasetLoadError) as caught:
                load_dataset(self.input)
            self.assertNotIn(str(self.overlay), str(caught.exception))
            self.assertNotIn(text, str(caught.exception))
        self.overlay.write_bytes(b'x' * (MAX_BYTES + 1))
        with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': str(self.overlay)}), self.assertRaises(DatasetLoadError):
            load_dataset(self.input)
        for path in ['relative.json', str(Path(self.temp.name) / 'missing.json'), self.temp.name]:
            with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': path}), self.assertRaises(DatasetLoadError):
                load_dataset(self.input)

    def test_cache_and_version_invalidate_for_every_overlay_byte_change(self):
        entries = example()['entries']
        self.load(entries)
        with patch.dict(os.environ, {'FOODTOUR_EVIDENCE_PATH': str(self.overlay)}):
            repo = VenueRepository(self.input)
            first = repo.snapshot()
            self.assertIs(repo.snapshot(), first)
            self.overlay.write_text(self.overlay.read_text() + '\n', encoding='utf-8')
            second = repo.snapshot()
            self.assertNotEqual(first.dataset_version, second.dataset_version)
            self.assertIsNot(first, second)
            self.assertEqual(first.venues, second.venues)

    def test_verified_feasibility_requires_all_three_evidence_types(self):
        prefs = Preferences(origin=(21.0285, 105.8522), duration_min=240, start_time_min=600,
                            weekday=0, budget_vnd=200000, budget_scope='per_person', mode='strict')
        entries = example()['entries']
        ds = self.load(entries)
        tour = plan_tour(ds.venues, prefs, FakeVerifiedRoutes())
        self.assertEqual(tour.status, 'verified_feasible')
        self.assertEqual(len(tour.stops), 3)
        self.assertFalse(validate_tour(tour, ds.venues, prefs, FakeVerifiedRoutes()))
        self.assertNotEqual(plan_tour(ds.venues, prefs, StraightLineEstimator()).status, 'verified_feasible')
        from dataclasses import replace
        self.assertEqual(plan_tour(ds.venues, replace(prefs, mode='explore')).status, 'conditional')
        for keys in [('hours', 'hours_source', 'hours_verified_at'),
                     ('price_per_person_vnd', 'price_source', 'price_verified_at')]:
            partial = copy.deepcopy(entries)
            for entry in partial:
                for key in keys:
                    del entry[key]
            partial_ds = self.load(partial)
            self.assertNotEqual(plan_tour(partial_ds.venues, prefs, FakeVerifiedRoutes()).status, 'verified_feasible')
