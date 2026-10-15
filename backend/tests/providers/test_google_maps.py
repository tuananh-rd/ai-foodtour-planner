"""Google protocol tests: loopback fake only; no Google calls or real credentials."""
import json
import os
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs

from app.providers.google_maps import GoogleRoutesProvider, GoogleGeocoder, MATRIX_MASK, ROUTE_MASK, WALKING_WARNING

KEY = 'fake-server-secret-GOOGLE-123'
POINTS = [(21.0285, 105.8522), (21.029, 105.853), (21.03, 105.854)]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, body):
        s = self.server
        if s.delay:
            time.sleep(s.delay)
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(s.status)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_POST(self):
        s = self.server
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        s.requests.append((self.path, dict(self.headers), body))
        if s.raw is not None:
            return self.reply(s.raw)
        if 'computeRouteMatrix' in self.path:
            rows = [{'originIndex': i, 'destinationIndex': j, 'status': {},
                     'condition': 'ROUTE_EXISTS', 'duration': '61.5s', 'distanceMeters': 120}
                    for i in range(len(body['origins'])) for j in range(len(body['destinations']))]
            if s.cell:
                rows[-2].update(s.cell)
            return self.reply(rows)
        pts = [body['origin'], *body['intermediates'], body['destination']]
        coords = [[p['location']['latLng']['longitude'], p['location']['latLng']['latitude']] for p in pts]
        self.reply({'routes': [{'legs': [{'polyline': {'geoJsonLinestring': {
            'type': 'LineString', 'coordinates': [a, b]}}} for a, b in zip(coords, coords[1:])],
                               'warnings': s.warnings}]})

    def do_GET(self):
        s = self.server
        s.requests.append((self.path, dict(self.headers), None))
        self.reply(s.raw if s.raw is not None else {'status': 'OK', 'results': [
            {'formatted_address': 'Synthetic public landmark', 'place_id': 'synthetic-place',
             'geometry': {'location': {'lat': 21.0285, 'lng': 105.8522}}} for _ in range(7)]})


class GoogleFakeCase(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        s = self.server
        s.status, s.delay, s.raw, s.cell, s.warnings, s.requests = 200, 0, None, None, [], []
        threading.Thread(target=lambda: s.serve_forever(poll_interval=.01), daemon=True).start()
        self.addCleanup(lambda: (s.shutdown(), s.server_close()))
        self.base = f'http://127.0.0.1:{s.server_port}'
        env = patch.dict(os.environ, {'GOOGLE_MAPS_SERVER_KEY': KEY, 'FOODTOUR_ROUTING_DAILY_BUDGET': '100'})
        env.start()
        self.addCleanup(env.stop)

    def routing(self, **kw):
        return GoogleRoutesProvider(self.base, **kw)

    def geocoder(self, **kw):
        return GoogleGeocoder(self.base, **kw)

    def test_matrix_fixed_mask_walk_duration_and_cache(self):
        p = self.routing()
        self.assertTrue(p.prepare(POINTS))
        leg = p.leg(*POINTS[:2])
        self.assertEqual((leg.minutes, leg.km, leg.source), (2, .12, 'provider_route'))
        path, headers, body = self.server.requests[0]
        self.assertEqual(path, '/distanceMatrix/v2:computeRouteMatrix')
        self.assertEqual(headers['X-Goog-Fieldmask'], MATRIX_MASK)
        self.assertEqual(headers['X-Goog-Api-Key'], KEY)
        self.assertEqual(body['travelMode'], 'WALK')
        self.assertNotIn('routingPreference', body)
        self.assertTrue(p.prepare(POINTS))
        self.assertEqual(len(self.server.requests), 1)

    def test_matrix_chunk_limits_no_truncation(self):
        pts = [(21 + i / 1000, 105.8) for i in range(50)]
        p = self.routing()
        self.assertTrue(p.prepare(pts))
        self.assertEqual(len(self.server.requests), 4)
        for _, _, body in self.server.requests:
            n, m = len(body['origins']), len(body['destinations'])
            self.assertLessEqual(n * m, 625)
            self.assertLessEqual(n + m, 50)
        self.assertEqual(p.leg(pts[-1], pts[0]).source, 'provider_route')
        self.assertFalse(p.prepare(pts + [(22, 106)]))
        self.assertEqual(len(self.server.requests), 4)

    def test_status_and_not_found_never_estimated(self):
        for cell in ({'condition': 'ROUTE_NOT_FOUND'}, {'status': {'code': 7}},
                     {'duration': 'bad'}, {'distanceMeters': -1}, {'status': 'bad'}):
            with self.subTest(cell=cell):
                self.server.cell = cell
                p = self.routing()
                self.assertTrue(p.prepare(POINTS))
                self.assertEqual(p.leg(POINTS[-1], POINTS[-2]).source, 'unknown')

    def test_failures_and_quota_never_raise_or_retry_each_leg(self):
        for status, raw in ((429, None), (500, None), (200, b'{'), (200, b'{}'),
                            (200, b'x' * (2 * 1024 * 1024 + 1))):
            with self.subTest(status=status, size=len(raw or b'')):
                self.server.status, self.server.raw = status, raw
                p = self.routing()
                self.assertFalse(p.prepare(POINTS))
                self.assertEqual(p.leg(*POINTS[:2]).source, 'unknown')
                self.assertEqual(p.last_error, 'quota' if status == 429 else ('unavailable' if status == 500 else 'bad_response'))
        self.server.status, self.server.raw = 200, None
        p = self.routing(daily_budget=0)
        before = len(self.server.requests)
        self.assertFalse(p.prepare(POINTS))
        self.assertEqual(p.last_error, 'quota')
        self.assertEqual(len(self.server.requests), before)

    def test_failed_batch_cooldown_recovers_without_per_leg_retry(self):
        p = self.routing()
        self.server.status = 500
        with patch('app.providers.google_maps.monotonic', return_value=100):
            self.assertFalse(p.prepare(POINTS))
            for a in POINTS:
                for b in POINTS:
                    self.assertEqual(p.leg(a, b).source, 'unknown')
            self.assertEqual(len(self.server.requests), 1)
        self.server.status = 200
        with patch('app.providers.google_maps.monotonic', return_value=131):
            self.assertTrue(p.prepare(POINTS))
            self.assertEqual(p.leg(*POINTS[:2]).source, 'provider_route')
        self.assertEqual(len(self.server.requests), 2)

    def test_timeout(self):
        self.server.delay = .3
        p = self.routing(timeout_s=.05)
        self.assertFalse(p.prepare(POINTS))
        self.assertEqual(p.last_error, 'timeout')
        g = self.geocoder(timeout_s=.05)
        self.assertEqual(g.geocode('synthetic')['status'], 'unavailable')
        self.assertEqual(g.last_error, 'timeout')

    def test_geometry_coordinate_order_warnings_and_limits(self):
        self.server.warnings = ['Provider walking warning: verbatim.']
        p = self.routing()
        self.assertEqual(p.geometry(POINTS), [[POINTS[0], POINTS[1]], [POINTS[1], POINTS[2]]])
        self.assertEqual(p.warnings(POINTS), self.server.warnings)
        path, headers, body = self.server.requests[-1]
        self.assertEqual(path, '/directions/v2:computeRoutes')
        self.assertEqual(headers['X-Goog-Fieldmask'], ROUTE_MASK)
        self.assertEqual(body['polylineEncoding'], 'GEO_JSON_LINESTRING')
        self.assertEqual(body['travelMode'], 'WALK')
        self.assertIsNone(p.geometry(POINTS * 10))
        self.assertEqual(len(self.server.requests), 1)
        self.server.warnings = []
        p2 = self.routing()
        p2.geometry(POINTS)
        self.assertEqual(p2.warnings(POINTS), [WALKING_WARNING])

    def test_geometry_malformed_and_lru_bound(self):
        self.server.raw = {'routes': [{'legs': [], 'warnings': []}]}
        p = self.routing()
        self.assertIsNone(p.geometry(POINTS))
        self.server.raw = None
        p = self.routing(cache_size=16)
        p.prepare([(21 + i / 1000, 105) for i in range(5)])
        self.assertLessEqual(len(p._legs), 16)

    def test_geocode_fixed_country_bias_five_results_and_budget(self):
        g = self.geocoder(daily_budget=1)
        found = g.geocode('https://evil.invalid/?private=query')
        self.assertEqual(found['status'], 'ok')
        self.assertEqual(len(found['results']), 5)
        path = urlsplit(self.server.requests[-1][0])
        self.assertEqual(path.path, '/maps/api/geocode/json')
        params = parse_qs(path.query)
        self.assertEqual(params['components'], ['country:VN'])
        self.assertEqual(params['bounds'], ['20.5,105.4|21.5,106.2'])
        self.assertEqual(params['address'], ['https://evil.invalid/?private=query'])
        self.assertEqual(g.geocode('other')['status'], 'quota')
        self.assertEqual(len(self.server.requests), 1)

    def test_geocode_errors(self):
        for status, body, expected in ((429, {}, 'quota'), (500, {}, 'unavailable'),
                (200, {'status': 'ZERO_RESULTS'}, 'zero_results'),
                (200, {'status': 'OVER_QUERY_LIMIT'}, 'quota'),
                (200, {'status': 'REQUEST_DENIED'}, 'unavailable'),
                (200, b'{', 'unavailable'), (200, b'x' * 131073, 'unavailable'),
                (200, {'status': 'OK', 'results': [{}]}, 'unavailable')):
            self.server.status, self.server.raw = status, body
            self.assertEqual(self.geocoder().geocode('synthetic')['status'], expected)

    def test_secret_reflection_and_no_external_override(self):
        self.server.warnings = [KEY]
        p = self.routing()
        self.assertIsNone(p.geometry(POINTS))
        self.assertEqual(p.last_error, 'bad_response')
        valid = {'status': 'OK', 'results': [{'formatted_address': KEY,
            'geometry': {'location': {'lat': 21.0285, 'lng': 105.8522}}}]}
        for raw in (valid, json.dumps(valid).replace('G', '\\u0047').encode()):
            self.server.raw = raw
            g = self.geocoder()
            self.assertEqual(g.geocode('x')['status'], 'unavailable')
            self.assertEqual(g.last_error, 'bad_response')
            self.assertNotIn(KEY, str(g.last_error))
        with patch('app.providers.http_transport.build_opener', side_effect=AssertionError('nonloopback socket')):
            self.assertFalse(GoogleRoutesProvider('https://evil.invalid').prepare(POINTS))
            self.assertEqual(GoogleGeocoder('https://evil.invalid').geocode('x')['status'], 'unavailable')
            with patch.dict(os.environ, {'GOOGLE_MAPS_SERVER_KEY': ''}):
                self.assertFalse(GoogleRoutesProvider().prepare(POINTS))
