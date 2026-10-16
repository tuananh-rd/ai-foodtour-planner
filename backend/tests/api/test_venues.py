"""Read-only snapshot listing, pagination and evidence allowlist regressions."""
import csv
import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.schemas import VenueListItem
from app.main import create_app


class VenueListTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "absent.json"
        self.client = TestClient(create_app(data_path=self.path))
        self.addCleanup(self.client.close)

    def test_synthetic_default_list_and_detail_share_snapshot(self):
        data = self.client.get("/v1/venues").json()
        self.assertEqual(data["dataset_source"], "synthetic")
        self.assertTrue(data["items"])
        self.assertEqual(data["limit"], 50)
        self.assertEqual(data["offset"], 0)
        for item in data["items"]:
            detail = self.client.get(f"/v1/venues/{item['id']}")
            self.assertEqual(detail.status_code, 200)
            for key, value in detail.json().items():
                self.assertEqual(item[key], value)
            self.assertEqual(item["foody_id"], item["id"])
            self.assertTrue(item["synthetic"])
            self.assertEqual(item["hours"]["status"], "unknown")
            self.assertIsNone(item["hours"]["open_at_arrival"])
            self.assertEqual(item["price"]["semantics"], "venue_range")

    def test_pagination_and_city_filter(self):
        full = self.client.get("/v1/venues").json()
        page = self.client.get("/v1/venues?limit=2&offset=1").json()
        self.assertEqual(page["total"], full["total"])
        self.assertEqual(page["items"], full["items"][1:3])
        self.assertEqual((page["limit"], page["offset"]), (2, 1))
        absent = self.client.get("/v1/venues?city=Unknown").json()
        self.assertEqual((absent["items"], absent["total"]), ([], 0))
        self.assertEqual(self.client.get("/v1/venues?offset=9999").json()["items"], [])

    def test_pagination_bounds_are_enveloped_errors(self):
        for query in ("limit=0", "limit=201", "limit=-1", "offset=-1", "offset=oops", "limit=1.5"):
            response = self.client.get(f"/v1/venues?{query}")
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["error"]["code"], "validation_error")
        self.assertEqual(self.client.get("/v1/venues?limit=200").status_code, 200)

    def test_configured_csv_bounded_and_allowlisted_not_legacy_load(self):
        path = Path(self.temp.name) / "synthetic.csv"
        fields = ["foody_id", "name", "city", "lat", "lon", "geo_status", "price_status",
                  "price_min_vnd_norm", "price_max_vnd_norm", "venue_types", "dish_groups",
                  "source_url", "hours_displayed", "private_extra", "hours_status"]
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for i in range(251):
                writer.writerow(dict(foody_id=f"TEST-{i:04}", name="[SYNTHETIC] CSV fixture",
                    city="Hà Nội" if i < 250 else "Other", lat=21.03, lon=105.85,
                    geo_status="ok", price_status="ok" if i else "unknown_zero",
                    price_min_vnd_norm=10000 if i else 0, price_max_vnd_norm=20000 if i else 0,
                    venue_types="Shop Online" if i == 1 else "Food", dish_groups="test",
                    source_url=f"https://example.invalid/{i}", hours_displayed="",
                    hours_status="day_mapping_unknown", private_extra="DO-NOT-EXPOSE"))
        with patch.dict(os.environ, {"FOODTOUR_DATA_PATH": str(path)}), TestClient(create_app()) as client:
            first = client.get("/v1/venues").json()
            self.assertEqual(first["total"], 250)
            self.assertEqual(len(first["items"]), 50)
            self.assertEqual(first["dataset_source"], "private")
            self.assertEqual(first["dataset_version"], hashlib.sha256(path.read_bytes()).hexdigest())
            last = client.get("/v1/venues?limit=200&offset=200").json()
            self.assertEqual(len(last["items"]), 50)
            self.assertNotEqual(first["items"][0]["id"], last["items"][0]["id"])
            self.assertEqual(len(client.get("/v1/venues?limit=200").json()["items"]), 200)
            for item in first["items"]:
                self.assertEqual(set(item), set(VenueListItem.model_fields))
                self.assertNotIn("DO-NOT-EXPOSE", str(item))
                self.assertEqual(client.get(f"/v1/venues/{item['id']}").status_code, 200)
            self.assertIsNone(first["items"][0]["price_max_vnd_norm"])
            self.assertEqual(first["items"][1]["venue_types"], "Shop Online")
            self.assertTrue(first["items"][1]["online_only"])
            self.assertEqual(first["items"][0]["cuisine_styles"], [])  # v1.6 unknown tags
