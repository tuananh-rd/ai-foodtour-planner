"""Phase 3: allowlisted transport, Gemini (fake server), checked explanations, walking routing with geometry."""
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import load_local_env
from app.llm.explain import CheckedExplainer, check_explanation, tour_facts
from app.llm.extract import MockExtractor
from app.llm.provider import FallbackExtractor, LLMExtractor, ProviderError
from app.main import create_app
from app.planner.engine import plan_tour, replace_stop, validate_tour
from app.planner.types import Preferences
from app.providers import http_transport
from app.providers.gemini import GeminiClient, GeminiExplanationProvider, GeminiExtractionProvider
from app.providers.walking import ORSWalkingProvider, OSRMWalkingProvider
from tests.planner.test_planner_core import load_fixture

FAKE_KEY = "fake-test-key-123"


class FakeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _reply(self, status, payload):
        raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        srv = self.server
        srv.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
        status = srv.status_seq.pop(0) if srv.status_seq else srv.status
        if status != 200:
            return self._reply(status, {"error": {"message": "fake"}})
        if ":generateContent" in self.path:
            if srv.gemini_raw is not None:
                return self._reply(200, srv.gemini_raw)
            return self._reply(200, {"candidates": [{"content": {"parts": [{"text": json.dumps(srv.gemini_json)}]}}],
                                     "usageMetadata": {"promptTokenCount": 10, "totalTokenCount": 20}})
        if self.path.endswith("/v2/matrix/foot-walking"):
            n = len(body["locations"])
            d = [[0 if i == j else srv.seconds for j in range(n)] for i in range(n)]
            m = [[0 if i == j else srv.meters for j in range(n)] for i in range(n)]
            if srv.unreachable is not None:
                d[0][srv.unreachable] = None
                m[0][srv.unreachable] = None
            return self._reply(200, {"durations": d, "distances": m})
        if self.path.endswith("/v2/directions/foot-walking/geojson"):
            coords, line, wps = body["coordinates"], [], []
            for i, (lon, lat) in enumerate(coords):
                if i:
                    plon, plat = coords[i - 1]
                    line.append([(plon + lon) / 2, (plat + lat) / 2 + 0.0002])
                wps.append(len(line))
                line.append([lon, lat])
            if srv.bad_waypoints:
                wps = wps[:-1]
            return self._reply(200, {"type": "FeatureCollection", "features": [{"type": "Feature",
                "geometry": {"type": "LineString", "coordinates": line},
                "properties": {"way_points": wps, "segments": []}}]})
        return self._reply(404, {})


class FakeServerCase(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeHandler)
        self.server.daemon_threads = True
        s = self.server
        s.requests, s.status, s.gemini_json, s.gemini_raw, s.status_seq = [], 200, {}, None, []
        s.seconds, s.meters, s.unreachable, s.bad_waypoints = 300, 350, None, False
        threading.Thread(target=lambda: s.serve_forever(poll_interval=.01), daemon=True).start()
        self.addCleanup(lambda: (s.shutdown(), s.server_close()))
        self.base = f"http://127.0.0.1:{s.server_port}"
        env = patch.dict(os.environ, {"GEMINI_API_KEY": FAKE_KEY, "ORS_API_KEY": FAKE_KEY,
                                      "FOODTOUR_PROVIDER_HOSTS": "", "FOODTOUR_LLM_DAILY_BUDGET": "50",
                                      "FOODTOUR_ROUTING_DAILY_BUDGET": "50"})
        env.start()
        self.addCleanup(env.stop)


class Transport(unittest.TestCase):
    def test_allowlist_rules(self):
        allowed = http_transport.destination_allowed
        with patch.dict(os.environ, {"FOODTOUR_PROVIDER_HOSTS": "api.example-routing.test"}):
            self.assertTrue(allowed("https://api.example-routing.test/v2/x"))
            self.assertFalse(allowed("http://api.example-routing.test/v2/x"))       # https only
            self.assertFalse(allowed("https://api.example-routing.test:8443/v2/x"))  # odd port
            self.assertFalse(allowed("https://evil.test/v2/x"))
            self.assertFalse(allowed("https://u:p@api.example-routing.test/x"))
            self.assertFalse(allowed("https://api.example-routing.test.evil.test/x"))
            self.assertTrue(allowed("http://127.0.0.1:8080/x"))
            self.assertFalse(allowed("http://127.0.0.1/x"))  # loopback needs explicit port
            self.assertFalse(allowed("file:///etc/passwd"))

    def test_refused_destination_opens_no_socket(self):
        with patch("app.providers.http_transport.build_opener", side_effect=AssertionError("socket")):
            with self.assertRaises(ProviderError):
                http_transport.request_bytes("https://not-allowlisted.test/x", deadline_s=1)


class GeminiFake(FakeServerCase):
    def client(self, **kw):
        return GeminiClient("gemini-test-model", base_url=self.base, **kw)

    def test_request_shape_and_key_header(self):
        self.server.gemini_json = {"duration_min": 120, "origin_landmark": "hồ gươm", "interests": ["phở"],
                                   "budget_vnd": None}
        r = LLMExtractor(GeminiExtractionProvider(self.client())).extract("phở quanh Hồ Gươm 2 giờ")
        self.assertEqual((r.status, r.source), ("ok", "live"))
        self.assertEqual(r.preferences.duration_min, 120)
        self.assertEqual(r.preferences.origin, (21.0285, 105.8522))
        req = self.server.requests[0]
        self.assertEqual(req["path"], "/v1beta/models/gemini-test-model:generateContent")
        self.assertEqual(req["headers"].get("x-goog-api-key"), FAKE_KEY)
        cfg = req["body"]["generationConfig"]
        self.assertEqual(cfg["responseMimeType"], "application/json")
        self.assertIn("origin_landmark", cfg["responseSchema"]["properties"])
        self.assertNotIn(FAKE_KEY, repr(r))

    def test_model_cannot_supply_coordinates_or_unknown_landmark(self):
        self.server.gemini_json = {"origin_landmark": "Nhà riêng của tôi", "origin": {"lat": 21.0, "lon": 105.8}}
        r = LLMExtractor(GeminiExtractionProvider(self.client())).extract("x")
        self.assertIsNone(r.preferences.origin)
        self.assertIn("origin", r.rejected_fields)

    def test_failures_map_to_kinds_and_fallback_is_labelled(self):
        for status, kind in ((429, "quota"), (500, "unavailable"), (403, "unavailable")):
            self.server.status = status
            with self.assertRaises(ProviderError) as e:
                self.client().generate_json("s", "u", {"type": "OBJECT"}, deadline_s=2)
            self.assertEqual(e.exception.kind, kind)
            self.assertNotIn(FAKE_KEY, str(e.exception))
        self.server.status = 200
        self.server.gemini_raw = {"promptFeedback": {"blockReason": "SAFETY"}}
        with self.assertRaises(ProviderError):
            self.client().generate_json("s", "u", {"type": "OBJECT"}, deadline_s=2)
        self.server.gemini_raw = {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}
        fb = FallbackExtractor(LLMExtractor(GeminiExtractionProvider(self.client())), MockExtractor())
        r = fb.extract("muốn ăn phở 2 giờ quanh hồ gươm")
        self.assertEqual((r.status, r.source), ("ok", "mock"))
        self.assertTrue(any("bộ luật" in n for n in r.notes))
        self.assertEqual(r.preferences.duration_min, 120)

    def test_single_retry_only_for_transient_server_errors(self):
        self.server.gemini_json = {"duration_min": 90}
        self.server.status_seq = [503]
        out = self.client().generate_json("s", "u", {"type": "OBJECT"}, deadline_s=5)
        self.assertEqual(out, {"duration_min": 90})
        self.assertEqual(len(self.server.requests), 2)
        for status, kind in ((429, "quota"), (403, "unavailable")):
            self.server.requests.clear()
            self.server.status_seq = [status]
            with self.assertRaises(ProviderError) as e:
                self.client().generate_json("s", "u", {"type": "OBJECT"}, deadline_s=5)
            self.assertEqual((e.exception.kind, e.exception.status), (kind, status))
            self.assertEqual(len(self.server.requests), 1)  # no retry
        self.server.requests.clear()
        self.server.status_seq = [503, 503]
        with self.assertRaises(ProviderError):
            self.client().generate_json("s", "u", {"type": "OBJECT"}, deadline_s=5)
        self.assertEqual(len(self.server.requests), 2)  # exactly one retry

    def test_daily_budget_and_missing_key(self):
        c = self.client(daily_budget=1)
        self.server.gemini_json = {}
        c.generate_json("s", "u", {"type": "OBJECT"}, deadline_s=2)
        with self.assertRaises(ProviderError) as e:
            c.generate_json("s", "u", {"type": "OBJECT"}, deadline_s=2)
        self.assertEqual(e.exception.kind, "quota")
        self.assertEqual(len(self.server.requests), 1)
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            self.assertFalse(self.client().configured)
            with self.assertRaises(ProviderError):
                self.client().generate_json("s", "u", {"type": "OBJECT"}, deadline_s=2)
        self.assertFalse(GeminiClient("../../etc", base_url=self.base).configured)  # model id validated

    def test_explainer_uses_checked_llm_text_or_template(self):
        vs = load_fixture()
        t = plan_tour(vs, Preferences(origin=(21.029, 105.851), duration_min=240, budget_vnd=500000,
                                      budget_scope="per_person"))
        good = (f"Lịch trình gồm {len(t.stops)} điểm dừng, tổng đi bộ khoảng {t.walk_minutes} phút theo ước tính "
                "đường chim bay. Giờ mở cửa và giá theo người chưa được xác minh.")
        self.server.gemini_json = {"tom_tat": good}
        ex = CheckedExplainer(GeminiExplanationProvider(self.client()))
        self.assertEqual(ex.explain(t, vs), (good, "llm"))
        ex.explain(t, vs)
        self.assertEqual(len(self.server.requests), 1)  # cached per identical facts
        self.server.gemini_json = {"tom_tat": "Các quán đều đang mở cửa, đảm bảo ngon."}
        text, source = CheckedExplainer(GeminiExplanationProvider(self.client())).explain(t, vs)
        self.assertEqual(source, "template")
        self.server.status = 403  # non-transient: neither the client nor the explainer retries
        before = len(self.server.requests)
        self.assertEqual(CheckedExplainer(GeminiExplanationProvider(self.client())).explain(t, vs)[1], "template")
        self.assertEqual(len(self.server.requests) - before, 1)  # no retry against a failing provider
        self.server.status = 200
        self.server.gemini_json = {"tom_tat": "Đi bộ hai mươi phút, chưa rõ giờ."}
        before = len(self.server.requests)
        ex2 = CheckedExplainer(GeminiExplanationProvider(self.client()))
        self.assertEqual(ex2.explain(t, vs)[1], "template")
        self.assertEqual(len(self.server.requests) - before, 2)  # one retry after a rejected text
        self.assertEqual(ex2.last_problems, ["spelled_number"])


class ExplanationChecker(unittest.TestCase):
    def setUp(self):
        self.vs = load_fixture()
        self.t = plan_tour(self.vs, Preferences(origin=(21.029, 105.851), duration_min=240, budget_vnd=500000,
                                                budget_scope="per_person"))
        self.facts = tour_facts(self.t, self.vs)

    def test_truthful_text_passes(self):
        text = (f"Gợi ý có điều kiện với {len(self.t.stops)} điểm dừng, đi bộ khoảng {self.t.walk_minutes} phút "
                "(ước tính). Giờ mở cửa, giá theo người và tuyến đi bộ thực tế chưa được xác minh.")
        self.assertEqual(check_explanation(text, self.facts), [])

    def test_adversarial_texts_fail(self):
        bad = {
            "Quán đang mở cửa và không xa, chưa rõ giá.": "opening_claim",
            "Giá mỗi người chỉ 30.000 đồng, chưa xác minh giờ.": "per_person_claim",
            "Lịch trình đã được xác minh đầy đủ.": "verified_claim",
            "Món ăn an toàn cho người dị ứng, chưa rõ giờ.": "guarantee_claim",
            "Tổng đi bộ 999 phút, chưa xác minh giờ.": "unsupported_number",
            "Xem thêm tại https://example.com, chưa xác minh.": "url_or_markup",
            "Lịch trình rất tuyệt.": "missing_uncertainty",
            "Đi theo tuyến đường thực tế ngắn nhất, chưa rõ giờ.": "route_claim",
        }
        for text, problem in bad.items():
            self.assertIn(problem, check_explanation(text, self.facts), text)
        self.assertIn("too_long", check_explanation("chưa rõ " * 200, self.facts))
        self.assertIn("spelled_number", check_explanation("Đi bộ hai mươi hai phút, chưa rõ giờ.", self.facts))
        self.assertNotIn("spelled_number", check_explanation("Quãng ngắn, chưa rõ giờ.", self.facts))
        # Restating the unknown list verbatim (as real Gemini output did) is truthful and must pass.
        listed = "Các điểm chưa được xác minh: " + ", ".join(self.facts["chua_biet"]) + "."
        self.assertEqual(check_explanation(listed, self.facts), [])
        self.assertEqual(check_explanation("", self.facts), ["empty"])


class ORSFake(FakeServerCase):
    def provider(self, **kw):
        return ORSWalkingProvider(self.base, **kw)

    def test_matrix_prefetch_one_call_and_geometry_split(self):
        p = self.provider()
        vs = load_fixture()
        prefs = Preferences(origin=(21.029, 105.851), duration_min=240, budget_vnd=500000, budget_scope="per_person")
        t = plan_tour(vs, prefs, p)
        matrix_calls = [r for r in self.server.requests if r["path"].endswith("/matrix/foot-walking")]
        self.assertEqual(len(matrix_calls), 1)
        self.assertEqual(matrix_calls[0]["headers"].get("authorization"), FAKE_KEY)
        self.assertEqual(t.leg_source, "provider_route")
        self.assertTrue(all(s.leg_from_previous == type(s.leg_from_previous)(5, 0.35, "provider_route")
                            for s in t.stops))
        self.assertEqual(validate_tour(t, vs, prefs, p), [])
        points = [prefs.origin] + [(v.lat, v.lon) for s in t.stops for v in vs if v.id == s.venue_id]
        lines = p.geometry(points)
        self.assertEqual(len(lines), len(t.stops))
        self.assertEqual(lines[0][0], points[0])
        self.assertEqual(lines[-1][-1], points[-1])
        self.assertEqual(len(lines[0]), 3)

    def test_unreachable_null_and_failures_are_unknown(self):
        self.server.unreachable = 1
        p = self.provider()
        a, b = (21.03, 105.85), (21.031, 105.851)
        p.prepare([a, b])
        self.assertEqual(p.leg(a, b).source, "unknown")
        self.assertEqual(p.leg(b, a).source, "provider_route")  # directed
        self.server.status = 500
        q = self.provider()
        self.assertEqual(q.leg(a, (21.04, 105.86)).source, "unknown")
        self.assertEqual(q.last_error, "unavailable")
        self.server.status = 200
        self.server.bad_waypoints = True
        self.assertIsNone(self.provider().geometry([a, b, (21.032, 105.852)]))

    def test_budget_and_no_key(self):
        p = self.provider(daily_budget=1)
        p.prepare([(21.03, 105.85), (21.031, 105.851)])
        self.assertEqual(p.leg((21.03, 105.85), (21.05, 105.87)).source, "unknown")
        self.assertEqual(p.last_error, "quota")
        with patch.dict(os.environ, {"ORS_API_KEY": ""}):
            self.assertFalse(self.provider().configured)
            self.assertEqual(self.provider().leg((21.03, 105.85), (21.031, 105.851)).source, "unknown")

    def test_replace_uses_one_bounded_matrix(self):
        p = self.provider()
        vs = load_fixture()
        prefs = Preferences(origin=(21.029, 105.851), duration_min=240, budget_vnd=500000, budget_scope="per_person")
        t = plan_tour(vs, prefs, p)
        before = len(self.server.requests)
        r = replace_stop(vs, prefs, t, t.stops[1].venue_id, p)
        self.assertTrue(r.ok)
        self.assertLessEqual(len(self.server.requests) - before, 1)


class ApiWithProviders(FakeServerCase):
    def test_tour_legs_carry_provider_geometry_and_health_labels(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env = {"FOODTOUR_LLM": "mock", "FOODTOUR_ROUTING": "ors", "FOODTOUR_EXPLAIN": "template",
               "FOODTOUR_SESSION_DB": "", "FOODTOUR_EVIDENCE_PATH": ""}
        with patch.dict(os.environ, env), patch("app.providers.walking.ORS_BASE", self.base):
            app = create_app(data_path=Path(temp.name) / "absent.json")
            app.state.routing = ORSWalkingProvider(self.base)
        with TestClient(app) as client:
            health = client.get("/health").json()
            self.assertEqual(health["routing_provider"], "ors")
            self.assertNotIn(FAKE_KEY, json.dumps(health))
            s = client.post("/v1/sessions").json()
            h = {"X-Session-Token": s["token"]}
            url = "/v1/sessions/" + s["session_id"]
            r = client.post(url + "/messages", headers=h, json={"text": "Hồ Gươm 3 giờ 500k mỗi người 3 quán"})
            tour = r.json()["tour"]
            self.assertEqual(tour["totals"]["leg_source"], "provider_route")
            for stop in tour["stops"]:
                g = stop["leg_from_previous"]["geometry"]
                self.assertTrue(g and len(g) >= 2 and all(len(pt) == 2 for pt in g))
            self.assertEqual(r.json()["extraction_source"], "rules")

    def test_estimate_mode_never_has_geometry(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        with patch.dict(os.environ, {"FOODTOUR_LLM": "mock", "FOODTOUR_ROUTING": "estimate", "FOODTOUR_SESSION_DB": ""}):
            app = create_app(data_path=Path(temp.name) / "absent.json")
        with TestClient(app) as client:
            s = client.post("/v1/sessions").json()
            r = client.post("/v1/sessions/" + s["session_id"] + "/messages", headers={"X-Session-Token": s["token"]},
                            json={"text": "Hồ Gươm 3 giờ 500k mỗi người 3 quán"}).json()
            self.assertEqual(r["tour"]["totals"]["leg_source"], "straight_line_estimate")
            self.assertTrue(all(st["leg_from_previous"]["geometry"] is None for st in r["tour"]["stops"]))


class LocalEnv(unittest.TestCase):
    def test_only_project_keys_and_no_override(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / ".env"
            f.write_text("# c\nFOODTOUR_TEST_A='x y'\nPATH=evil\nGEMINI_API_KEY=k\nFOODTOUR_TEST_B=1\nnoequals\n",
                         encoding="utf-8")
            with patch.dict(os.environ, {"FOODTOUR_TEST_B": "keep", "GEMINI_API_KEY": "env"}, clear=False):
                os.environ.pop("FOODTOUR_TEST_A", None)
                loaded = load_local_env(f)
                self.assertEqual(loaded, ["FOODTOUR_TEST_A"])
                self.assertEqual(os.environ["FOODTOUR_TEST_A"], "x y")
                self.assertEqual(os.environ["FOODTOUR_TEST_B"], "keep")
                self.assertEqual(os.environ["GEMINI_API_KEY"], "env")
                self.assertNotEqual(os.environ.get("PATH"), "evil")
                os.environ.pop("FOODTOUR_TEST_A", None)


class ExplanationPrivacy(unittest.TestCase):
    def test_facts_sent_to_llm_contain_no_venue_identity(self):
        vs = load_fixture()
        t = plan_tour(vs, Preferences(origin=(21.029, 105.851), duration_min=240, budget_vnd=500000,
                                      budget_scope="per_person"))
        dumped = json.dumps(tour_facts(t, vs), ensure_ascii=False)
        for s in t.stops:
            v = next(x for x in vs if x.id == s.venue_id)
            for secret in (v.name, v.address, v.source_url, v.id):
                self.assertNotIn(secret, dumped)


class ExplanationTimeBudget(unittest.TestCase):
    def test_retry_only_when_enough_time_remains(self):
        import time as _t
        vs = load_fixture()
        t = plan_tour(vs, Preferences(origin=(21.029, 105.851), duration_min=240, budget_vnd=500000,
                                      budget_scope="per_person"))

        class Slow:
            def __init__(self):
                self.deadlines = []

            def explain(self, facts, *, deadline_s):
                self.deadlines.append(deadline_s)
                _t.sleep(0.3)
                return "Đi bộ hai mươi phút, chưa rõ giờ."  # always rejected (spelled number)

        slow = Slow()
        text, source = CheckedExplainer(slow, deadline_s=1.0, min_retry_s=0.9).explain(t, vs)
        self.assertEqual(source, "template")
        self.assertEqual(len(slow.deadlines), 1)  # ~0.7 s left < 0.9 s: no retry
        slow2 = Slow()
        CheckedExplainer(slow2, deadline_s=3.0, min_retry_s=0.5).explain(t, vs)
        self.assertEqual(len(slow2.deadlines), 2)
        self.assertLess(slow2.deadlines[1], slow2.deadlines[0])  # retry gets only the remaining budget


if __name__ == "__main__":
    unittest.main()
