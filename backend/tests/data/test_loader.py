"""Synthetic-only regression inputs. No private venue identities or locations."""
import csv
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.data import DatasetLoadError, aggregate_report, load_dataset
from app.data.loader import SYNTHETIC_PATH
from app.planner.engine import plan_tour, validate_tour
from app.planner.types import Preferences, Venue


def row(identity="TEST-001", **changes):
    return dict({
        "id": identity, "foody_id": identity, "name": "[SYNTHETIC] Loader test",
        "lat": 21.03, "lon": 105.85, "geo_status": "ok", "city": "Hà Nội",
        "source_url": f"https://example.invalid/{identity}", "venue_types": "Food",
        "price_status": "ok", "price_min_vnd_norm": 10000, "price_max_vnd_norm": 20000,
        "dish_groups": " bún | bánh | bún ", "hours_status": "day_mapping_unknown",
        "hours_displayed": "06:00-22:00 (unverified)",
    }, **changes)


class LoaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "input.json"

    def load_rows(self, rows):
        self.path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        return load_dataset(self.path)

    def test_normalization_and_no_evidence_promotion(self):
        ds = self.load_rows([row(price_evidence="verified", synthetic=True,
                                 hours={"0": [[0, 1440]]}, hours_status="day_mapping_unknown")])
        v = ds.venues[0]
        self.assertIsInstance(v, Venue)
        self.assertEqual(v.dish_tags, ("bánh", "bún"))
        self.assertEqual((v.price_min_vnd, v.price_max_vnd), (10000, 20000))
        self.assertEqual(v.price_evidence, "estimate")
        self.assertIsNone(v.hours)
        self.assertEqual(v.hours_display, "06:00-22:00 (unverified)")
        self.assertFalse(v.synthetic)
        self.assertTrue(v.geo_ok)
        self.assertEqual(ds.dataset_source, "json")
        self.assertEqual(ds.dataset_version, hashlib.sha256(self.path.read_bytes()).hexdigest())

    def test_null_zero_malformed_nonfinite_and_bounds_coordinates(self):
        invalid = [(None, 105), ("", 105), ("bad", 105), (True, 105),
                   (float("nan"), 105), (21, float("inf")), (91, 105),
                   (21, -181), (0, 0)]
        ds = self.load_rows([row(str(i), lat=a, lon=b) for i, (a, b) in enumerate(invalid)])
        self.assertEqual(ds.venues, ())
        self.assertEqual(ds.rejected, {"invalid_coordinates": 8, "zero_coordinate_pair": 1})
        self.assertEqual(aggregate_report(ds)["rejected_rows"], 9)
        # Zero on only one axis is not the (0,0) sentinel.
        self.assertEqual(len(self.load_rows([row(lat=0)]).venues), 1)

    def test_geo_status_and_online_are_flags_for_planner(self):
        ds = self.load_rows([row(venue_types="Food | Shop Online", geo_status="unverified")])
        self.assertTrue(ds.venues[0].online_only)
        self.assertFalse(ds.venues[0].geo_ok)
        self.assertEqual(ds.flags["online_only"], 1)
        self.assertEqual(ds.flags["unverified_geo_status"], 1)

    def test_unknown_zero_negative_fractional_inverted_prices(self):
        cases = [dict(price_min_vnd_norm=None), dict(price_max_vnd_norm=0),
                 dict(price_min_vnd_norm="0.0"), dict(price_min_vnd_norm=-1),
                 dict(price_max_vnd_norm="oops"), dict(price_min_vnd_norm="1.2"),
                 dict(price_min_vnd_norm=True), dict(price_max_vnd_norm="NaN"),
                 dict(price_min_vnd_norm=30000), dict(price_status="invalid_range"),
                 dict(price_status="unknown_zero")]
        ds = self.load_rows([row(str(i), **case) for i, case in enumerate(cases)])
        self.assertEqual(len(ds.venues), len(cases))
        for v in ds.venues:
            self.assertIsNone(v.price_min_vnd)
            self.assertIsNone(v.price_max_vnd)
            self.assertEqual(v.price_evidence, "estimate")
        self.assertEqual(ds.flags["unknown_price"], len(cases))

    def test_integral_decimal_csv_prices_supported(self):
        v = self.load_rows([row(price_min_vnd_norm="10000.0", price_max_vnd_norm="20000.0")]).venues[0]
        self.assertEqual((v.price_min_vnd, v.price_max_vnd), (10000, 20000))

    def test_duplicate_id_then_url_and_deterministic_order(self):
        rows = [row("B"), row("A", source_url="https://example.invalid/shared"),
                row("C", source_url="https://example.invalid/shared"),
                row("A", source_url="https://example.invalid/shared", name="[SYNTHETIC] Z alternative")]
        first = self.load_rows(rows)
        second = self.load_rows(list(reversed(rows)))
        self.assertEqual(first.venues, second.venues)
        self.assertEqual([v.id for v in first.venues], ["A", "B"])
        self.assertEqual(first.rejected, {"duplicate_id": 1, "duplicate_source_url": 1})

    def test_missing_urls_do_not_collapse_distinct_ids(self):
        ds = self.load_rows([row("A", source_url=""), row("B", source_url=None)])
        self.assertEqual(len(ds.venues), 2)
        self.assertEqual(ds.flags["missing_source_url"], 2)

    def test_rejection_and_flags_report_contains_only_counts(self):
        ds = self.load_rows([row(id=""), row(name=""), None, row(dish_groups=None)])
        report = aggregate_report(ds)
        self.assertEqual(report["rejected_rows"], 3)
        self.assertEqual(report["loaded_rows"], 1)
        self.assertEqual(report["flags_by_reason"]["missing_dish_tags"], 1)
        self.assertNotIn("example.invalid", json.dumps(report))
        self.assertNotIn("SYNTHETIC", json.dumps(report))
        self.assertNotIn(str(self.path), json.dumps(report))
        report["rejections_by_reason"].clear()
        self.assertEqual(sum(ds.rejected.values()), 3)

    def test_absent_path_fallback_label_hash_and_planner_integration(self):
        ds = load_dataset(self.path)
        self.assertEqual(ds.dataset_source, "synthetic")
        self.assertTrue(ds.venues)
        self.assertTrue(all(v.synthetic for v in ds.venues))
        self.assertTrue(all(v.hours is None and v.price_evidence == "estimate" for v in ds.venues))
        self.assertEqual(ds.dataset_version, hashlib.sha256(SYNTHETIC_PATH.read_bytes()).hexdigest())
        prefs = Preferences(origin=(21.029, 105.851), duration_min=240,
                            budget_vnd=500000, budget_scope="per_person", max_leg_min=25)
        tour = plan_tour(ds.venues, prefs)
        self.assertEqual(tour.status, "conditional")
        self.assertEqual(len(tour.stops), 3)
        self.assertEqual(validate_tour(tour, ds.venues, prefs), [])

    def test_environment_and_default_path(self):
        expected = self.load_rows([row()])
        with patch.dict(os.environ, {"FOODTOUR_DATA_PATH": str(self.path)}):
            self.assertEqual(load_dataset(), expected)
        with patch.dict(os.environ, {}, clear=True), patch("app.data.loader.DEFAULT_PATH", self.path):
            self.assertEqual(load_dataset(), expected)

    def test_relative_path_rejected(self):
        with self.assertRaises(DatasetLoadError) as caught:
            load_dataset("relative.json")
        self.assertEqual(caught.exception.report, {"errors_by_reason": {"path_not_absolute": 1}})

    def test_malformed_json_and_wrong_shape_do_not_fallback(self):
        for text in ('{broken', '{"venues": []}', 'null'):
            with self.subTest(text=text):
                self.path.write_text(text, encoding="utf-8")
                with self.assertRaises(DatasetLoadError) as caught:
                    load_dataset(self.path)
                self.assertNotIn(str(self.path), str(caught.exception))

    def test_existing_empty_file_and_unreadable_directory_do_not_fallback(self):
        self.assertEqual(self.load_rows([]).venues, ())
        with self.assertRaises(DatasetLoadError):
            load_dataset(Path(self.temp.name))

    def test_csv_bom_roundtrip_matches_json(self):
        r = row()
        del r["id"]  # source CSV uses foody_id
        expected = self.load_rows([r])
        path = self.path.with_suffix(".csv")
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(r))
            writer.writeheader()
            writer.writerow(r)
        ds = load_dataset(path)
        self.assertEqual(ds.venues, expected.venues)
        self.assertEqual(ds.dataset_source, "csv")
        self.assertEqual(ds.dataset_version, hashlib.sha256(path.read_bytes()).hexdigest())

    def test_malformed_csv_rejected(self):
        path = self.path.with_suffix(".csv")
        for text in ('id,id\na,b\n', 'id,name\na,b,c\n', 'id,name\na\n', 'id,name\n"unterminated'):
            path.write_text(text, encoding="utf-8")
            with self.subTest(text=text), self.assertRaises(DatasetLoadError):
                load_dataset(path)

    def test_file_bytes_not_modified(self):
        self.load_rows([row()])
        before = self.path.read_bytes()
        load_dataset(self.path)
        self.assertEqual(self.path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
