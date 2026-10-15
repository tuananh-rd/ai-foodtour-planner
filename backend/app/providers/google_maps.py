"""Google Routes v2 and Geocoding v3. Fixed endpoints, bounded calls, no payload logging."""
import json
import math
import os
import unicodedata
from urllib.parse import urlencode
from time import monotonic

from app.llm.provider import ProviderError
from app.planner.types import Leg
from .http_transport import allow_host, provider_endpoint, request_bytes
from .walking import WalkingRouteProvider, UNKNOWN, _line, _num, _point

ROUTES_BASE = 'https://routes.googleapis.com'
GEOCODE_BASE = 'https://maps.googleapis.com'
MATRIX_MASK = 'originIndex,destinationIndex,status,condition,distanceMeters,duration'
ROUTE_MASK = 'routes.legs.polyline.geoJsonLinestring,routes.warnings'
WALKING_WARNING = ('WALK, BICYCLE, and TWO_WHEELER routes are in beta and might sometimes be missing '
                   'clear sidewalks, pedestrian paths, or bicycling paths.')


def waypoint(point):
    return {'location': {'latLng': {'latitude': point[0], 'longitude': point[1]}}}


def duration(value):
    if not isinstance(value, str) or not value.endswith('s'):
        raise ValueError
    return _num(float(value[:-1]), 86400)


class GoogleRoutesProvider(WalkingRouteProvider):
    name = 'google_routes'

    def __init__(self, base_url=ROUTES_BASE, *, api_key_env='GOOGLE_MAPS_SERVER_KEY', **kw):
        super().__init__(**kw)
        self.api_key_env = api_key_env
        if base_url == ROUTES_BASE:
            allow_host('routes.googleapis.com')
        self.base_url = provider_endpoint(base_url)
        # Tests can inject a literal loopback base; runtime has no client-controlled base URL.
        if self.base_url and self.base_url != ROUTES_BASE:
            from .http_transport import local_endpoint
            self.base_url = local_endpoint(self.base_url)
        self._warnings = {}
        self._blocked_until = 0.0

    @property
    def configured(self):
        return bool(self.base_url and os.getenv(self.api_key_env, '').strip())

    def _json(self, path, body, mask):
        if not self.configured:
            raise ProviderError('unavailable')
        self._admit()
        raw = request_bytes(self.base_url + path, body=json.dumps(body, allow_nan=False).encode(),
            headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': os.environ[self.api_key_env],
                     'X-Goog-FieldMask': mask}, deadline_s=self.timeout_s, max_bytes=2 * 1024 * 1024)
        # Never pass provider-reflected credentials into geometry, warnings or public fields.
        if os.environ[self.api_key_env].encode() in raw:
            raise ProviderError('bad_response')
        try:
            data = json.loads(raw)
            if os.environ[self.api_key_env] in json.dumps(data, ensure_ascii=False):
                raise ProviderError('bad_response')
            return data
        except (ValueError, UnicodeError, RecursionError):
            raise ProviderError('bad_response') from None

    def prepare(self, points):
        try:
            pts = list(dict.fromkeys(_point(p) for p in points))
            if len(pts) > 50:
                self.last_error = 'too_many_points'
                return False
        except (TypeError, ValueError):
            self.last_error = 'bad_request'
            return False
        with self._lock:
            if monotonic() < self._blocked_until:
                return False
            if not self.configured:
                self.last_error = 'unavailable'
                return False
            if not pts or all((a, b) in self._legs for a in pts for b in pts):
                return True
            staged = {}
            try:
                # <=25 origins + <=25 destinations; each product <=625. No truncation.
                for oi in range(0, len(pts), 25):
                    origins = pts[oi:oi + 25]
                    for di in range(0, len(pts), 25):
                        destinations = pts[di:di + 25]
                        if all((a, b) in self._legs for a in origins for b in destinations):
                            continue
                        payload = {'origins': [{'waypoint': waypoint(p)} for p in origins],
                            'destinations': [{'waypoint': waypoint(p)} for p in destinations],
                            'travelMode': 'WALK', 'languageCode': 'vi', 'regionCode': 'VN'}
                        data = self._json('/distanceMatrix/v2:computeRouteMatrix', payload, MATRIX_MASK)
                        if not isinstance(data, list) or len(data) > len(origins) * len(destinations):
                            raise ValueError
                        found = set()
                        for element in data:
                            i, j = element.get('originIndex', 0), element.get('destinationIndex', 0)
                            if (type(i) is not int or type(j) is not int or not 0 <= i < len(origins)
                                    or not 0 <= j < len(destinations) or (i, j) in found):
                                raise ValueError
                            found.add((i, j))
                            status = element.get('status', {})
                            answer = UNKNOWN
                            if (isinstance(status, dict) and type(status.get('code', 0)) is int
                                    and status.get('code', 0) == 0 and element.get('condition') == 'ROUTE_EXISTS'):
                                try:
                                    sec = duration(element.get('duration'))
                                    meters = _num(element.get('distanceMeters', 0), 1000000)
                                    answer = Leg(math.ceil(sec / 60), round(meters / 1000, 3), 'provider_route')
                                except (ValueError, TypeError):
                                    pass
                            staged[(origins[i], destinations[j])] = answer
                        for a in origins:
                            for b in destinations:
                                staged.setdefault((a, b), UNKNOWN)
                for (a, b), answer in staged.items():
                    self._store(a, b, answer)
                self.reachable, self.last_error = True, None
                return True
            except ProviderError as error:
                self.last_error = error.kind
            except Exception:
                self.last_error = 'bad_response'
            self.reachable = False
            # One failed batch must not trigger paid retries for each candidate leg.
            # A short cooldown allows transient failures / next-day quota resets to recover.
            self._blocked_until = monotonic() + 30
            return False

    def leg(self, a, b):
        try:
            a, b = _point(a), _point(b)
        except (TypeError, ValueError):
            return UNKNOWN
        with self._lock:
            if (a, b) in self._legs:
                self._legs.move_to_end((a, b))
                return self._legs[(a, b)]
            self.prepare([a, b])
            return self._legs.get((a, b), UNKNOWN)

    def geometry(self, points):
        try:
            pts = tuple(_point(p) for p in points)
            if not 2 <= len(pts) <= 27:
                self.last_error = 'too_many_points'
                return None
        except (TypeError, ValueError):
            return None
        with self._lock:
            if pts in self._geoms:
                self._geoms.move_to_end(pts)
                return self._geoms[pts]
            try:
                body = {'origin': waypoint(pts[0]), 'destination': waypoint(pts[-1]),
                    'intermediates': [waypoint(p) for p in pts[1:-1]], 'travelMode': 'WALK',
                    'polylineEncoding': 'GEO_JSON_LINESTRING', 'polylineQuality': 'HIGH_QUALITY',
                    'languageCode': 'vi', 'regionCode': 'VN'}
                data = self._json('/directions/v2:computeRoutes', body, ROUTE_MASK)
                route = data['routes'][0]
                legs, warnings = route['legs'], route.get('warnings', [])
                if (not isinstance(legs, list) or len(legs) != len(pts) - 1 or not isinstance(warnings, list)
                        or any(not isinstance(w, str) for w in warnings)):
                    raise ValueError
                lines = []
                for leg in legs:
                    shape = leg['polyline']['geoJsonLinestring']
                    if shape.get('type') != 'LineString':
                        raise ValueError
                    lines.append(_line(shape['coordinates']))
                self._geoms[pts] = lines
                self._warnings[pts] = warnings if any(w.strip() for w in warnings) else warnings + [WALKING_WARNING]
                while len(self._geoms) > 256:
                    oldest, _ = self._geoms.popitem(last=False)
                    self._warnings.pop(oldest, None)
                self.last_error = None
                return lines
            except ProviderError as error:
                self.last_error = error.kind
            except Exception:
                self.last_error = 'bad_response'
            return None

    def warnings(self, points):
        with self._lock:
            return list(self._warnings.get(tuple(map(tuple, points)), [WALKING_WARNING]))


class GoogleGeocoder:
    name = 'google_geocoding'

    def __init__(self, base_url=GEOCODE_BASE, *, api_key_env='GOOGLE_MAPS_SERVER_KEY',
                 daily_budget=None, timeout_s=8.0):
        self.api_key_env, self.timeout_s = api_key_env, timeout_s
        self.budget = WalkingRouteProvider(daily_budget=(daily_budget if daily_budget is not None
            else os.getenv('FOODTOUR_GEOCODE_DAILY_BUDGET', '100')))
        self.last_error = None
        if base_url == GEOCODE_BASE:
            allow_host('maps.googleapis.com')
        self.base_url = provider_endpoint(base_url)
        if self.base_url and self.base_url != GEOCODE_BASE:
            from .http_transport import local_endpoint
            self.base_url = local_endpoint(self.base_url)

    @property
    def configured(self):
        return bool(self.base_url and os.getenv(self.api_key_env, '').strip())

    def geocode(self, query):
        result = {'status': 'unavailable', 'provider': self.name, 'results': []}
        if not self.configured:
            return result
        with self.budget._lock:
            try:
                self.budget._admit()
                params = {'address': query, 'key': os.environ[self.api_key_env], 'components': 'country:VN',
                          'bounds': '20.5,105.4|21.5,106.2', 'region': 'vn', 'language': 'vi'}
                raw = request_bytes(self.base_url + '/maps/api/geocode/json?' + urlencode(params),
                    deadline_s=self.timeout_s, max_bytes=128 * 1024)
                if os.environ[self.api_key_env].encode() in raw:
                    raise ValueError
                data = json.loads(raw)
                if os.environ[self.api_key_env] in json.dumps(data, ensure_ascii=False):
                    raise ValueError
                status = data.get('status')
                if status in ('OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT'):
                    raise ProviderError('quota')
                if status == 'ZERO_RESULTS':
                    self.last_error = None
                    return dict(result, status='zero_results')
                if status != 'OK' or not isinstance(data.get('results'), list):
                    raise ProviderError('unavailable')
                found = []
                for row in data['results']:
                    location = row['geometry']['location']
                    lat, lon = _point((location['lat'], location['lng']))
                    label, place_id = row['formatted_address'], row.get('place_id')
                    if (not isinstance(label, str) or not label.strip() or len(label) > 500
                            or any(unicodedata.category(c) in ('Cc', 'Cf', 'Cs') for c in label)
                            or (place_id is not None and (not isinstance(place_id, str) or len(place_id) > 256
                                or any(unicodedata.category(c) in ('Cc', 'Cf', 'Cs') for c in place_id)))):
                        raise ValueError
                    found.append({'label': label, 'lat': lat, 'lon': lon, 'place_id': place_id})
                    if len(found) == 5:
                        break
                self.last_error = None
                return dict(result, status='ok' if found else 'zero_results', results=found)
            except ProviderError as error:
                self.last_error = error.kind
                return dict(result, status='quota' if error.kind == 'quota' else 'unavailable')
            except Exception:
                self.last_error = 'bad_response'
                return result
