"""Independent integration QA for Phase 4 backend and planner HTTP API.

Covers:
(1) GET /v1/client-config: unavailable shape, null js_api_key/map_id (not omitted), no secrets, no-store header.
(2) GET /v1/venues/map: bbox filter correctness against GET /v1/venues, limit<=500 enforced, truncated flag,
    deterministic order, only physical valid-geo venues, no hours/per-person claims in items, invalid/inverted bbox.
(3) POST /v1/geocode: 401 without token, 403 wrong token, status unavailable when provider not configured,
    body size/length validation (query>200, controls), rate limit 429 after burst, no echo of query in errors.
(4) Session origin metadata: PUT preferences with origin_label/origin_source accepted/rejected per contract v1.5
    (control chars, length>120, bad enum), persistence across reads (GET /v1/sessions/{id}), and origin_source
    never changing planning results.
(5) Message flow with free-text origin: rule extractor does not produce origin_text, missing-slot question for
    unknown place, built-in landmark sets origin_label and origin_source=landmark.
(6) Tour output: estimated legs have geometry null, totals.route_provider null, route_warnings empty.
(7) Injection/privacy: scan ALL captured responses and server stdout/stderr for API keys and leaked session tokens.
(8) Stale/dataset_changed semantics: skipped (covered by Codex).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

# Ensure console supports UTF-8
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class HttpExchange:
    scenario: str
    name: str
    method: str
    url: str
    request_headers: Dict[str, str]
    request_body: Any
    status_code: int
    response_headers: Dict[str, str]
    response_body: Any
    raw_response_text: str
    duration_ms: float
    passed: bool
    notes: str = ""


class AuditRecorder:
    def __init__(self):
        self.exchanges: List[HttpExchange] = []
        self.created_tokens: List[str] = []

    def record(self, exchange: HttpExchange):
        self.exchanges.append(exchange)

    def register_token(self, token: str):
        if token and token not in self.created_tokens:
            self.created_tokens.append(token)


class TestRunner:
    def __init__(self, base_url: str, client: httpx.Client, recorder: AuditRecorder):
        self.base_url = base_url.rstrip("/")
        self.client = client
        self.recorder = recorder
        self.scenario_results: Dict[str, List[Dict[str, Any]]] = {}

    def _request(
        self,
        scenario: str,
        name: str,
        method: str,
        path: str,
        headers: Optional[Dict[str, str]] = None,
        json_data: Any = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[httpx.Response, HttpExchange]:
        url = f"{self.base_url}{path}"
        req_headers = dict(headers or {})
        start = time.perf_counter()
        res = self.client.request(
            method,
            url,
            headers=req_headers,
            json=json_data,
            params=params,
            timeout=10.0,
        )
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        try:
            body_json = res.json()
        except Exception:
            body_json = None

        exchange = HttpExchange(
            scenario=scenario,
            name=name,
            method=method,
            url=str(res.url),
            request_headers={k: ("<REDACTED_TOKEN>" if k.lower() == "x-session-token" else v) for k, v in req_headers.items()},
            request_body=json_data,
            status_code=res.status_code,
            response_headers=dict(res.headers),
            response_body=body_json,
            raw_response_text=res.text,
            duration_ms=duration_ms,
            passed=False,
        )
        return res, exchange

    def assert_test(self, exchange: HttpExchange, condition: bool, description: str):
        if not condition:
            exchange.passed = False
            exchange.notes = f"FAILED: {description}"
            self.recorder.record(exchange)
            print(f"  [FAIL] {exchange.name}: {description}")
            raise AssertionError(f"[{exchange.name}] {description}")
        else:
            exchange.passed = True
            exchange.notes = description
            self.recorder.record(exchange)
            print(f"  [PASS] {exchange.name}: {description}")

    def create_session(self, scenario: str, name: str = "create_session") -> Tuple[str, str, int]:
        res, ex = self._request(scenario, name, "POST", "/v1/sessions")
        self.assert_test(ex, res.status_code == 200, "Session created with status 200")
        data = res.json()
        self.assert_test(ex, "session_id" in data and "token" in data and "revision" in data, "Session schema complete")
        self.recorder.register_token(data["token"])
        return data["session_id"], data["token"], data["revision"]

    # =========================================================================
    # Scenario 1: GET /v1/client-config
    # =========================================================================
    def run_scenario_1(self):
        print("\n=== Scenario 1: GET /v1/client-config ===")
        res, ex = self._request("SCENARIO_1", "client_config_unavailable", "GET", "/v1/client-config")
        self.assert_test(ex, res.status_code == 200, "Status is 200 OK")

        # Check Cache-Control header
        cc = res.headers.get("cache-control", "")
        self.assert_test(ex, "no-store" in cc, f"Cache-Control header contains 'no-store' (got: {cc})")

        # Verify raw JSON text explicitly includes js_api_key and map_id as null (not omitted)
        raw = res.text
        self.assert_test(ex, '"js_api_key": null' in raw or '"js_api_key":null' in raw, "js_api_key present as null in JSON (not omitted)")
        self.assert_test(ex, '"map_id": null' in raw or '"map_id":null' in raw, "map_id present as null in JSON (not omitted)")

        body = res.json()
        maps = body.get("maps", {})
        self.assert_test(ex, maps.get("provider") == "google", "maps.provider is 'google'")
        self.assert_test(ex, maps.get("status") == "unavailable", "maps.status is 'unavailable'")
        self.assert_test(ex, maps.get("reason") == "not_configured", "maps.reason is 'not_configured'")
        self.assert_test(ex, maps.get("js_api_key") is None, "maps.js_api_key is None")
        self.assert_test(ex, maps.get("map_id") is None, "maps.map_id is None")
        self.assert_test(ex, maps.get("language") == "vi" and maps.get("region") == "VN", "maps language/region is vi/VN")
        self.assert_test(ex, maps.get("default_center") == {"lat": 21.0285, "lon": 105.8522}, "maps default_center is Hanoi")
        self.assert_test(ex, maps.get("default_zoom") == 15, "maps default_zoom is 15")

        geo = body.get("geocoding", {})
        self.assert_test(ex, geo.get("status") == "unavailable", "geocoding.status is 'unavailable'")

        routing = body.get("routing", {})
        self.assert_test(ex, routing.get("provider") == "estimate", "routing.provider is 'estimate'")
        self.assert_test(ex, routing.get("status") == "unavailable", "routing.status is 'unavailable'")

        privacy = body.get("privacy", {})
        self.assert_test(ex, privacy.get("sent_to_google") == ["map_tiles", "autocomplete_text", "route_coordinates"],
                         "privacy.sent_to_google matches contract")
        self.assert_test(ex, privacy.get("doc") == "docs/PHASE4.md", "privacy.doc is 'docs/PHASE4.md'")

        # Ensure no secrets leak in the body
        for secret_name in ("GOOGLE_MAPS_SERVER_KEY", "GEMINI_API_KEY", "ORS_API_KEY", "AIza", "sk-"):
            self.assert_test(ex, secret_name not in raw, f"No secret or key indicator '{secret_name}' in client-config")

    # =========================================================================
    # Scenario 2: GET /v1/venues/map
    # =========================================================================
    def run_scenario_2(self):
        print("\n=== Scenario 2: GET /v1/venues/map ===")
        # Fetch venues baseline
        res_v, ex_v = self._request("SCENARIO_2", "venues_baseline", "GET", "/v1/venues", params={"limit": 200})
        self.assert_test(ex_v, res_v.status_code == 200, "Venues baseline status 200")
        all_venues = res_v.json().get("items", [])

        # Define Hanoi Old Quarter bounding box covering the synthetic cluster
        # Cluster is around lat 21.028..21.039, lon 105.850..105.858
        bbox = {"min_lat": 21.025, "max_lat": 21.040, "min_lon": 105.845, "max_lon": 105.860}

        # Expected venues from /v1/venues: physical (online_only == False), geo_ok == True, inside bbox
        expected_venues = [
            v for v in all_venues
            if not v.get("online_only", False)
            and v.get("geo_status") == "ok"
            and bbox["min_lat"] <= v["lat"] <= bbox["max_lat"]
            and bbox["min_lon"] <= v["lon"] <= bbox["max_lon"]
        ]
        expected_ids = sorted([v["id"] for v in expected_venues])

        # Query /v1/venues/map
        res_map, ex_map = self._request("SCENARIO_2", "venues_map_bbox_correctness", "GET", "/v1/venues/map",
                                         params={**bbox, "limit": 500})
        self.assert_test(ex_map, res_map.status_code == 200, "Map venues query status 200")
        map_data = res_map.json()
        map_items = map_data.get("items", [])
        map_ids = [m["id"] for m in map_items]

        self.assert_test(ex_map, map_ids == expected_ids,
                         f"Map venue IDs match expected physical valid-geo venues (got {len(map_ids)}, expected {len(expected_ids)})")
        self.assert_test(ex_map, map_data.get("total_in_view") == len(expected_ids),
                         f"total_in_view equals count ({map_data.get('total_in_view')} == {len(expected_ids)})")
        self.assert_test(ex_map, map_data.get("truncated") is False, "truncated is False when limit >= total")

        # Test limit <= 500 enforced: limit=501 -> 422
        res_501, ex_501 = self._request("SCENARIO_2", "venues_map_limit_501", "GET", "/v1/venues/map",
                                         params={**bbox, "limit": 501})
        self.assert_test(ex_501, res_501.status_code == 422, "limit=501 returns 422 validation_error")

        # limit=0 -> 422
        res_0, ex_0 = self._request("SCENARIO_2", "venues_map_limit_0", "GET", "/v1/venues/map",
                                     params={**bbox, "limit": 0})
        self.assert_test(ex_0, res_0.status_code == 422, "limit=0 returns 422 validation_error")

        # Truncated flag test with limit=2 (when total > 2)
        if len(expected_ids) > 2:
            res_trunc, ex_trunc = self._request("SCENARIO_2", "venues_map_truncated_flag", "GET", "/v1/venues/map",
                                                params={**bbox, "limit": 2})
            self.assert_test(ex_trunc, res_trunc.status_code == 200, "limit=2 query status 200")
            trunc_data = res_trunc.json()
            self.assert_test(ex_trunc, trunc_data.get("truncated") is True, "truncated is True when limit < total_in_view")
            self.assert_test(ex_trunc, len(trunc_data.get("items", [])) == 2, "Returned items length equals limit (2)")
            self.assert_test(ex_trunc, trunc_data.get("total_in_view") == len(expected_ids),
                             "total_in_view reflects all venues in bbox")

        # Deterministic order test
        res_rep, ex_rep = self._request("SCENARIO_2", "venues_map_deterministic_order", "GET", "/v1/venues/map",
                                         params={**bbox, "limit": 500})
        self.assert_test(ex_rep, [m["id"] for m in res_rep.json().get("items", [])] == map_ids,
                         "Repeated query returns identical order of IDs")
        self.assert_test(ex_rep, map_ids == sorted(map_ids), "Order is deterministically sorted by id")

        # Only physical valid-geo venues: verify SYN-009 (online_only) and SYN-010 (invalid geo) are absent
        self.assert_test(ex_map, "SYN-009" not in map_ids, "SYN-009 (online_only) is excluded from map items")
        self.assert_test(ex_map, "SYN-010" not in map_ids, "SYN-010 (geo_ok=False) is excluded from map items")
        for item in map_items:
            self.assert_test(ex_map, -90 <= item["lat"] <= 90 and -180 <= item["lon"] <= 180,
                             f"Venue {item['id']} has valid coordinates")

        # No hours/per-person claims in items
        allowed_keys = {"id", "name", "lat", "lon", "district", "dish_tags", "price_max_vnd", "synthetic"}
        forbidden_keys = {"hours", "hours_display", "hours_status", "price_semantics", "price_min_vnd", "open_at_arrival", "price"}
        for item in map_items:
            item_keys = set(item.keys())
            self.assert_test(ex_map, item_keys.issubset(allowed_keys),
                             f"Venue {item['id']} contains only MapVenue allowed keys (got extra: {item_keys - allowed_keys})")
            self.assert_test(ex_map, not bool(item_keys.intersection(forbidden_keys)),
                             f"Venue {item['id']} contains no hours or per-person claims")

        # Invalid/inverted bbox handling
        # Inverted lat: min_lat > max_lat
        res_inv_lat, ex_inv_lat = self._request("SCENARIO_2", "venues_map_inverted_lat", "GET", "/v1/venues/map",
                                                params={"min_lat": 22.0, "max_lat": 21.0, "min_lon": 105.0, "max_lon": 106.0})
        self.assert_test(ex_inv_lat, res_inv_lat.status_code == 422, "Inverted lat (min > max) returns 422")
        self.assert_test(ex_inv_lat, res_inv_lat.json().get("error", {}).get("code") == "validation_error",
                         "Inverted lat returns validation_error code")

        # Inverted lon: min_lon > max_lon
        res_inv_lon, ex_inv_lon = self._request("SCENARIO_2", "venues_map_inverted_lon", "GET", "/v1/venues/map",
                                                params={"min_lat": 21.0, "max_lat": 22.0, "min_lon": 107.0, "max_lon": 106.0})
        self.assert_test(ex_inv_lon, res_inv_lon.status_code == 422, "Inverted lon (min > max) returns 422")

        # Out-of-bounds coordinates
        res_oob_lat, ex_oob_lat = self._request("SCENARIO_2", "venues_map_oob_lat", "GET", "/v1/venues/map",
                                                params={"min_lat": -95.0, "max_lat": 21.0, "min_lon": 105.0, "max_lon": 106.0})
        self.assert_test(ex_oob_lat, res_oob_lat.status_code == 422, "Out of bounds min_lat=-95 returns 422")

        res_oob_lon, ex_oob_lon = self._request("SCENARIO_2", "venues_map_oob_lon", "GET", "/v1/venues/map",
                                                params={"min_lat": 21.0, "max_lat": 22.0, "min_lon": 105.0, "max_lon": 185.0})
        self.assert_test(ex_oob_lon, res_oob_lon.status_code == 422, "Out of bounds max_lon=185 returns 422")

    # =========================================================================
    # Scenario 3: POST /v1/geocode
    # =========================================================================
    def run_scenario_3(self):
        print("\n=== Scenario 3: POST /v1/geocode ===")
        # 401 without token
        res_no_tok, ex_no_tok = self._request("SCENARIO_3", "geocode_missing_token", "POST", "/v1/geocode",
                                              json_data={"query": "Hồ Gươm"})
        self.assert_test(ex_no_tok, res_no_tok.status_code == 401, "Missing token returns 401")
        self.assert_test(ex_no_tok, res_no_tok.json().get("error", {}).get("code") == "unauthorized_session",
                         "Missing token returns unauthorized_session code")

        # 403 wrong token
        res_bad_tok, ex_bad_tok = self._request("SCENARIO_3", "geocode_wrong_token", "POST", "/v1/geocode",
                                                headers={"X-Session-Token": "invalid_wrong_token_xyz_123"},
                                                json_data={"query": "Hồ Gươm"})
        self.assert_test(ex_bad_tok, res_bad_tok.status_code == 403, "Wrong token returns 403")
        self.assert_test(ex_bad_tok, res_bad_tok.json().get("error", {}).get("code") == "unauthorized_session",
                         "Wrong token returns unauthorized_session code")

        # Create valid session
        sid, token, _ = self.create_session("SCENARIO_3", "geocode_valid_session")

        # Status unavailable when provider not configured
        res_unavail, ex_unavail = self._request("SCENARIO_3", "geocode_unconfigured_provider", "POST", "/v1/geocode",
                                                headers={"X-Session-Token": token},
                                                json_data={"query": "Hồ Gươm"})
        self.assert_test(ex_unavail, res_unavail.status_code == 200, "Unconfigured geocoder returns 200 OK per v1.5 addendum")
        unavail_body = res_unavail.json()
        self.assert_test(ex_unavail, unavail_body.get("status") == "unavailable", "Geocode status is 'unavailable'")
        self.assert_test(ex_unavail, unavail_body.get("provider") == "google_geocoding", "Geocode provider is 'google_geocoding'")
        self.assert_test(ex_unavail, unavail_body.get("results") == [], "Geocode results is empty list")

        # Body size/length validation: query > 200 -> 422
        long_query = "A" * 201
        res_len, ex_len = self._request("SCENARIO_3", "geocode_query_length_201", "POST", "/v1/geocode",
                                        headers={"X-Session-Token": token},
                                        json_data={"query": long_query})
        self.assert_test(ex_len, res_len.status_code == 422, "Query length 201 returns 422 validation_error")

        # Body validation: empty query -> 422
        res_empty, ex_empty = self._request("SCENARIO_3", "geocode_query_empty", "POST", "/v1/geocode",
                                            headers={"X-Session-Token": token},
                                            json_data={"query": ""})
        self.assert_test(ex_empty, res_empty.status_code == 422, "Empty query returns 422 validation_error")

        # Body validation: whitespace query -> 422
        res_ws, ex_ws = self._request("SCENARIO_3", "geocode_query_whitespace", "POST", "/v1/geocode",
                                      headers={"X-Session-Token": token},
                                      json_data={"query": "     "})
        self.assert_test(ex_ws, res_ws.status_code == 422, "Whitespace query returns 422 validation_error")

        # Body validation: control characters -> 422
        res_ctrl, ex_ctrl = self._request("SCENARIO_3", "geocode_query_control_char", "POST", "/v1/geocode",
                                          headers={"X-Session-Token": token},
                                          json_data={"query": "Hồ Gươm\x00Hà Nội"})
        self.assert_test(ex_ctrl, res_ctrl.status_code == 422, "Control character in query returns 422 validation_error")

        # No echo of query in errors: verify sensitive probe text is not reflected in error response
        probe_secret = "SECRET_PROBE_NO_ECHO_TOKEN_999888"
        res_echo, ex_echo = self._request("SCENARIO_3", "geocode_no_echo_check", "POST", "/v1/geocode",
                                          headers={"X-Session-Token": token},
                                          json_data={"query": f"{probe_secret}\x07"})
        self.assert_test(ex_echo, res_echo.status_code == 422, "Control character probe returns 422")
        self.assert_test(ex_echo, probe_secret not in res_echo.text,
                         "No echo of invalid/rejected query text in 422 error response")

        # Rate limit 429 after burst
        # Dedicated session for rate limit burst test
        sid_burst, tok_burst, _ = self.create_session("SCENARIO_3", "geocode_rate_limit_session")
        burst_hit_429 = False
        burst_count = 0
        for i in range(75):
            res_b, ex_b = self._request("SCENARIO_3", f"geocode_burst_{i+1}", "POST", "/v1/geocode",
                                        headers={"X-Session-Token": tok_burst},
                                        json_data={"query": "Hồ Gươm"})
            burst_count += 1
            if res_b.status_code == 429:
                burst_hit_429 = True
                self.assert_test(ex_b, res_b.json().get("error", {}).get("code") == "rate_limited",
                                 f"Rate limit exceeded at request {burst_count} with code 'rate_limited'")
                break
        self.assert_test(ex_b, burst_hit_429, f"Rate limit 429 triggered within burst (triggered after {burst_count} calls)")

    # =========================================================================
    # Scenario 4: Session origin metadata
    # =========================================================================
    def run_scenario_4(self):
        print("\n=== Scenario 4: Session origin metadata ===")
        sid, token, rev = self.create_session("SCENARIO_4", "origin_meta_session")

        base_pref = {
            "city": "Hà Nội",
            "origin": {"lat": 21.0285, "lon": 105.8522},
            "duration_min": 120,
            "max_stops": 3,
            "mode": "explore",
        }

        # 1. Reject control characters in origin_label
        for ctrl_char, name in [("\x00", "null_byte"), ("\n", "newline"), ("\t", "tab"), ("\x1f", "unit_separator")]:
            res_ctrl, ex_ctrl = self._request("SCENARIO_4", f"origin_label_reject_{name}", "PUT",
                                              f"/v1/sessions/{sid}/preferences",
                                              headers={"X-Session-Token": token},
                                              json_data={"base_revision": rev,
                                                         "preferences": {**base_pref, "origin_label": f"Hồ Gươm{ctrl_char}",
                                                                         "origin_source": "landmark"}})
            self.assert_test(ex_ctrl, res_ctrl.status_code == 422,
                             f"origin_label containing {name} rejected with 422 validation_error")

        # 2. Reject length > 120 in origin_label
        long_label = "A" * 121
        res_len, ex_len = self._request("SCENARIO_4", "origin_label_reject_length_121", "PUT",
                                        f"/v1/sessions/{sid}/preferences",
                                        headers={"X-Session-Token": token},
                                        json_data={"base_revision": rev,
                                                   "preferences": {**base_pref, "origin_label": long_label,
                                                                   "origin_source": "landmark"}})
        self.assert_test(ex_len, res_len.status_code == 422,
                         "origin_label length 121 rejected with 422 validation_error")

        # 3. Reject bad enum in origin_source
        for bad_src in ["gps", "unknown", "satellite", "user", "browser"]:
            res_bad_enum, ex_bad_enum = self._request("SCENARIO_4", f"origin_source_reject_{bad_src}", "PUT",
                                                      f"/v1/sessions/{sid}/preferences",
                                                      headers={"X-Session-Token": token},
                                                      json_data={"base_revision": rev,
                                                                 "preferences": {**base_pref, "origin_label": "Hồ Gươm",
                                                                                 "origin_source": bad_src}})
            self.assert_test(ex_bad_enum, res_bad_enum.status_code == 422,
                             f"origin_source bad enum '{bad_src}' rejected with 422 validation_error")

        # 4. Accept valid origin_label and each valid origin_source enum
        valid_enums = ["current_location", "place", "manual_coordinates", "landmark", "geocoded", None]
        for src in valid_enums:
            label = f"Vị trí kiểm thử: {src}" if src else None
            res_ok, ex_ok = self._request("SCENARIO_4", f"origin_source_accept_{src or 'null'}", "PUT",
                                          f"/v1/sessions/{sid}/preferences",
                                          headers={"X-Session-Token": token},
                                          json_data={"base_revision": rev,
                                                     "preferences": {**base_pref, "origin_label": label,
                                                                     "origin_source": src}})
            self.assert_test(ex_ok, res_ok.status_code == 200, f"origin_source '{src}' accepted with 200 OK")
            body = res_ok.json()
            rev = body.get("revision")
            self.assert_test(ex_ok, body.get("preferences", {}).get("origin_source") == src,
                             f"Response preferences.origin_source matches '{src}'")
            self.assert_test(ex_ok, body.get("preferences", {}).get("origin_label") == label,
                             f"Response preferences.origin_label matches '{label}'")

        # 5. Persistence across reads (GET /v1/sessions/{id})
        res_get, ex_get = self._request("SCENARIO_4", "origin_meta_persistence_read", "GET", f"/v1/sessions/{sid}",
                                        headers={"X-Session-Token": token})
        self.assert_test(ex_get, res_get.status_code == 200, "GET session status 200 OK")
        stored_pref = res_get.json().get("preferences", {})
        self.assert_test(ex_get, stored_pref.get("origin_source") == valid_enums[-1],
                         f"Stored origin_source matches last update ({valid_enums[-1]})")

        # 6. Origin_source never changes planning results:
        # Compare planning results with origin_source="current_location" vs origin_source="manual_coordinates"
        sid_a, tok_a, rev_a = self.create_session("SCENARIO_4", "plan_compare_session_a")
        sid_b, tok_b, rev_b = self.create_session("SCENARIO_4", "plan_compare_session_b")

        pref_a = {**base_pref, "origin_label": "Vị trí GPS", "origin_source": "current_location"}
        pref_b = {**base_pref, "origin_label": "Tọa độ bản đồ", "origin_source": "manual_coordinates"}

        self._request("SCENARIO_4", "put_pref_a", "PUT", f"/v1/sessions/{sid_a}/preferences",
                      headers={"X-Session-Token": tok_a}, json_data={"base_revision": rev_a, "preferences": pref_a})
        self._request("SCENARIO_4", "put_pref_b", "PUT", f"/v1/sessions/{sid_b}/preferences",
                      headers={"X-Session-Token": tok_b}, json_data={"base_revision": rev_b, "preferences": pref_b})

        res_tour_a, ex_tour_a = self._request("SCENARIO_4", "plan_tour_a", "POST", f"/v1/sessions/{sid_a}/tour",
                                              headers={"X-Session-Token": tok_a}, json_data={"base_revision": rev_a + 1})
        res_tour_b, ex_tour_b = self._request("SCENARIO_4", "plan_tour_b", "POST", f"/v1/sessions/{sid_b}/tour",
                                              headers={"X-Session-Token": tok_b}, json_data={"base_revision": rev_b + 1})

        self.assert_test(ex_tour_a, res_tour_a.status_code == 200, "Tour A planned status 200")
        self.assert_test(ex_tour_b, res_tour_b.status_code == 200, "Tour B planned status 200")

        tour_a = res_tour_a.json().get("tour")
        tour_b = res_tour_b.json().get("tour")

        self.assert_test(ex_tour_b, tour_a is not None and tour_b is not None, "Both tours are not None")
        # Compare stops
        stops_a = [(s["venue_id"], s["order"], s["arrive"], s["depart"]) for s in tour_a["stops"]]
        stops_b = [(s["venue_id"], s["order"], s["arrive"], s["depart"]) for s in tour_b["stops"]]
        self.assert_test(ex_tour_b, stops_a == stops_b,
                         f"Tour stops are identical between different origin_source values (got {stops_a})")
        self.assert_test(ex_tour_b, tour_a["totals"] == tour_b["totals"], "Tour totals are identical")

    # =========================================================================
    # Scenario 5: Message flow with free-text origin
    # =========================================================================
    def run_scenario_5(self) -> Dict[str, Any]:
        print("\n=== Scenario 5: Message flow with free-text origin ===")
        # Part A: Unknown place with rule extractor (origin_text is not produced by MockExtractor)
        sid_unk, tok_unk, _ = self.create_session("SCENARIO_5", "msg_unknown_origin_session")
        res_unk, ex_unk = self._request("SCENARIO_5", "msg_unknown_place", "POST",
                                        f"/v1/sessions/{sid_unk}/messages",
                                        headers={"X-Session-Token": tok_unk},
                                        json_data={"text": "Mình muốn xuất phát từ Cầu Giấy, đi 2 tiếng"})
        self.assert_test(ex_unk, res_unk.status_code == 200, "Unknown place message status 200 OK")
        data_unk = res_unk.json()
        pref_unk = data_unk.get("preferences", {})

        # Verify origin is NOT set
        self.assert_test(ex_unk, pref_unk.get("origin") is None, "origin is None for unknown place under rule extractor")
        self.assert_test(ex_unk, pref_unk.get("origin_label") is None, "origin_label is None for unknown place")
        self.assert_test(ex_unk, pref_unk.get("origin_source") is None, "origin_source is None for unknown place")

        # Verify missing_slots includes "origin"
        missing = data_unk.get("missing_slots", [])
        self.assert_test(ex_unk, "origin" in missing, f"'origin' is in missing_slots (got: {missing})")

        # Verify questions includes the origin question
        questions = data_unk.get("questions", [])
        expected_q = "Bạn muốn xuất phát từ đâu (ví dụ: Hồ Gươm, Phố cổ)?"
        self.assert_test(ex_unk, expected_q in questions, f"Origin question present in questions (got: {questions})")

        # Verify tour is null because origin is missing
        self.assert_test(ex_unk, data_unk.get("tour") is None, "Tour is None when origin is missing")
        self.assert_test(ex_unk, data_unk.get("extraction_source") == "rules", "extraction_source is 'rules'")

        # Part B: Built-in landmark ("Hồ Gươm")
        sid_lm, tok_lm, _ = self.create_session("SCENARIO_5", "msg_landmark_session")
        res_lm, ex_lm = self._request("SCENARIO_5", "msg_builtin_landmark", "POST",
                                      f"/v1/sessions/{sid_lm}/messages",
                                      headers={"X-Session-Token": tok_lm},
                                      json_data={"text": "Mình xuất phát từ Hồ Gươm, đi 2 tiếng"})
        self.assert_test(ex_lm, res_lm.status_code == 200, "Landmark message status 200 OK")
        data_lm = res_lm.json()
        pref_lm = data_lm.get("preferences", {})

        # Verify origin, origin_label, origin_source
        self.assert_test(ex_lm, pref_lm.get("origin") == {"lat": 21.0285, "lon": 105.8522},
                         "origin is resolved to Hồ Gươm coordinates (21.0285, 105.8522)")
        self.assert_test(ex_lm, pref_lm.get("origin_label") == "Hồ Gươm",
                         f"origin_label is 'Hồ Gươm' (got: {pref_lm.get('origin_label')})")
        self.assert_test(ex_lm, pref_lm.get("origin_source") == "landmark",
                         f"origin_source is 'landmark' (got: {pref_lm.get('origin_source')})")
        self.assert_test(ex_lm, "origin" not in data_lm.get("missing_slots", []),
                         "'origin' is not in missing_slots after landmark match")

        # Tour is planned
        tour_lm = data_lm.get("tour")
        self.assert_test(ex_lm, tour_lm is not None, "Tour is successfully planned when landmark origin is supplied")
        self.assert_test(ex_lm, len(tour_lm.get("stops", [])) >= 1, "Tour has at least one stop")
        return tour_lm

    # =========================================================================
    # Scenario 6: Tour output
    # =========================================================================
    def run_scenario_6(self, tour: Optional[Dict[str, Any]] = None):
        print("\n=== Scenario 6: Tour output ===")
        if tour is None:
            # Plan a tour explicitly if not passed
            sid, token, rev = self.create_session("SCENARIO_6", "tour_output_session")
            pref = {
                "city": "Hà Nội",
                "origin": {"lat": 21.0285, "lon": 105.8522},
                "origin_label": "Hồ Gươm",
                "origin_source": "landmark",
                "duration_min": 120,
                "max_stops": 3,
                "mode": "explore",
            }
            self._request("SCENARIO_6", "put_pref_tour", "PUT", f"/v1/sessions/{sid}/preferences",
                          headers={"X-Session-Token": token}, json_data={"base_revision": rev, "preferences": pref})
            res_tour, ex_tour = self._request("SCENARIO_6", "plan_tour_output", "POST", f"/v1/sessions/{sid}/tour",
                                              headers={"X-Session-Token": token}, json_data={"base_revision": rev + 1})
            self.assert_test(ex_tour, res_tour.status_code == 200, "Tour planned successfully")
            tour = res_tour.json().get("tour")

        ex_dummy = HttpExchange(
            scenario="SCENARIO_6",
            name="tour_output_contract_fields",
            method="INSPECT",
            url=f"{self.base_url}/tour_inspection",
            request_headers={},
            request_body={},
            status_code=200,
            response_headers={},
            response_body=tour,
            raw_response_text=json.dumps(tour, ensure_ascii=False),
            duration_ms=0.0,
            passed=False,
        )

        totals = tour.get("totals", {})
        # totals.route_provider null
        self.assert_test(ex_dummy, totals.get("route_provider") is None,
                         f"totals.route_provider is None (null) for estimated tour (got: {totals.get('route_provider')})")
        self.assert_test(ex_dummy, totals.get("leg_source") == "straight_line_estimate",
                         "totals.leg_source is 'straight_line_estimate'")

        # route_warnings empty list
        warnings = tour.get("route_warnings", None)
        self.assert_test(ex_dummy, warnings == [], f"tour.route_warnings is [] empty list (got: {warnings})")

        # Estimated legs have geometry null
        stops = tour.get("stops", [])
        self.assert_test(ex_dummy, len(stops) > 0, f"Tour has stops (count: {len(stops)})")
        for idx, stop in enumerate(stops):
            leg = stop.get("leg_from_previous", {})
            self.assert_test(ex_dummy, leg.get("source") == "straight_line_estimate",
                             f"Stop #{idx+1} ({stop['venue_id']}) leg source is 'straight_line_estimate'")
            self.assert_test(ex_dummy, leg.get("geometry") is None,
                             f"Stop #{idx+1} ({stop['venue_id']}) leg geometry is None (null)")

    # =========================================================================
    # Scenario 7: Injection / privacy scanning
    # =========================================================================
    def run_scenario_7(self, captured_stdout: str, captured_stderr: str):
        print("\n=== Scenario 7: Injection/privacy scanning ===")
        ex_scan = HttpExchange(
            scenario="SCENARIO_7",
            name="privacy_and_token_leak_scan",
            method="SCAN",
            url=f"{self.base_url}/privacy_audit",
            request_headers={},
            request_body={},
            status_code=200,
            response_headers={},
            response_body={},
            raw_response_text="",
            duration_ms=0.0,
            passed=False,
        )

        # 1. Scan for leaked session tokens
        tokens = self.recorder.created_tokens
        print(f"  Scanning across {len(self.recorder.exchanges)} HTTP exchanges and server output for {len(tokens)} session tokens...")

        token_leaks = []
        for ex in self.recorder.exchanges:
            # Tokens should ONLY appear in the response body of POST /v1/sessions
            is_session_create = ex.method == "POST" and ex.url.endswith("/v1/sessions") and ex.status_code == 200
            for token in tokens:
                if token in ex.raw_response_text and not is_session_create:
                    token_leaks.append(f"Token leaked in response of {ex.method} {ex.url}")
                for h_name, h_val in ex.response_headers.items():
                    if token in h_val:
                        token_leaks.append(f"Token leaked in header {h_name} of {ex.method} {ex.url}")

        for token in tokens:
            if token in captured_stdout:
                token_leaks.append("Token leaked in server STDOUT")
            if token in captured_stderr:
                token_leaks.append("Token leaked in server STDERR")

        self.assert_test(ex_scan, len(token_leaks) == 0,
                         f"Zero session tokens leaked outside creation response (leaks: {token_leaks})")

        # 2. Scan for API key patterns
        api_key_regex = re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b")
        bearer_regex = re.compile(r"Bearer\s+[A-Za-z0-9\-_.]{20,}", re.IGNORECASE)
        sk_regex = re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")

        key_leaks = []
        for ex in self.recorder.exchanges:
            if api_key_regex.search(ex.raw_response_text):
                key_leaks.append(f"Google API Key pattern found in {ex.method} {ex.url}")
            if bearer_regex.search(ex.raw_response_text):
                key_leaks.append(f"Bearer token pattern found in {ex.method} {ex.url}")
            if sk_regex.search(ex.raw_response_text):
                key_leaks.append(f"Secret key pattern found in {ex.method} {ex.url}")

        if api_key_regex.search(captured_stdout) or bearer_regex.search(captured_stdout) or sk_regex.search(captured_stdout):
            key_leaks.append("Key/credential pattern found in server STDOUT")
        if api_key_regex.search(captured_stderr) or bearer_regex.search(captured_stderr) or sk_regex.search(captured_stderr):
            key_leaks.append("Key/credential pattern found in server STDERR")

        self.assert_test(ex_scan, len(key_leaks) == 0,
                         f"Zero API key or credential patterns found in traffic or server logs (leaks: {key_leaks})")


def run_full_suite(port: Optional[int] = None) -> Tuple[bool, AuditRecorder, str, str]:
    recorder = AuditRecorder()
    own_server = False
    proc = None
    stdout_buf = ""
    stderr_buf = ""

    server_port = port or find_free_port()
    base_url = f"http://127.0.0.1:{server_port}"

    repo_root = Path(__file__).resolve().parents[2]
    backend_python = Path("C:/Users/tuana/orca/workspaces/ai-foodtour-planner/foodtour-codex-backend/.venv/Scripts/python.exe")
    if not backend_python.exists():
        backend_python = Path(sys.executable)

    env = dict(os.environ)
    env["PYTHONPATH"] = "backend"
    env["FOODTOUR_LLM"] = "mock"
    env["FOODTOUR_ROUTING"] = "estimate"
    env["FOODTOUR_RATE_LIMIT_TOKEN"] = "60"
    for k in ["FOODTOUR_DATA_PATH", "GOOGLE_MAPS_BROWSER_KEY", "GOOGLE_MAPS_SERVER_KEY", "GOOGLE_MAPS_MAP_ID", "GEMINI_API_KEY"]:
        env.pop(k, None)

    server_log_path = repo_root / "qa" / "integration" / "server_test.log"
    server_log_file = open(server_log_path, "w", encoding="utf-8")
    print(f"Starting uvicorn test server on port {server_port} (logging to {server_log_path})...")
    proc = subprocess.Popen(
        [str(backend_python), "-m", "uvicorn", "app.server:app", "--host", "127.0.0.1", "--port", str(server_port)],
        cwd=str(repo_root),
        env=env,
        stdout=server_log_file,
        stderr=server_log_file,
    )
    own_server = True

    with httpx.Client() as client:
        # Wait for server readiness
        ready = False
        for _ in range(40):
            try:
                res = client.get(f"{base_url}/health", timeout=0.5)
                if res.status_code == 200 and res.json().get("status") == "ok":
                    ready = True
                    break
            except Exception:
                time.sleep(0.15)

        if not ready:
            proc.terminate()
            server_log_file.close()
            err_text = server_log_path.read_text(encoding="utf-8")
            raise RuntimeError(f"Server failed to start on port {server_port}.\nLogs:\n{err_text}")

        print("Test server is ready. Running test scenarios...\n")
        runner = TestRunner(base_url, client, recorder)

        try:
            runner.run_scenario_1()
            runner.run_scenario_2()
            runner.run_scenario_3()
            runner.run_scenario_4()
            tour = runner.run_scenario_5()
            runner.run_scenario_6(tour)
        finally:
            if own_server and proc:
                print("\nShutting down test server...")
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
                server_log_file.close()
                if server_log_path.exists():
                    stderr_buf = server_log_path.read_text(encoding="utf-8")

        # Run Scenario 7 with captured logs
        runner.run_scenario_7(stdout_buf, stderr_buf)

    all_passed = all(ex.passed for ex in recorder.exchanges)
    return all_passed, recorder, stdout_buf, stderr_buf


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Phase 4 integration tests.")
    parser.add_argument("--port", type=int, default=None, help="Specific free port to bind")
    parser.add_argument("--export-data", type=str, default=None, help="File path to save JSON exchange log")
    args = parser.parse_args()

    success, recorder, stdout_log, stderr_log = run_full_suite(args.port)
    total = len(recorder.exchanges)
    passed = sum(1 for e in recorder.exchanges if e.passed)
    failed = total - passed

    print("\n" + "=" * 60)
    print(f"INTEGRATION QA SUMMARY: {passed}/{total} checks passed ({failed} failed)")
    print("=" * 60)

    if args.export_data:
        out_path = Path(args.export_data)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        export_payload = {
            "summary": {"total": total, "passed": passed, "failed": failed},
            "exchanges": [
                {
                    "scenario": e.scenario,
                    "name": e.name,
                    "method": e.method,
                    "url": e.url,
                    "status_code": e.status_code,
                    "duration_ms": e.duration_ms,
                    "passed": e.passed,
                    "notes": e.notes,
                    "request_body": e.request_body,
                    "response_body": e.response_body,
                }
                for e in recorder.exchanges
            ],
            "server_stdout": stdout_log,
            "server_stderr": stderr_log,
        }
        out_path.write_text(json.dumps(export_payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Exported detailed audit log to {out_path}")

    sys.exit(0 if success else 1)
