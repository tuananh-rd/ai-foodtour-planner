"""OSRM-compatible foot requests, directed LRU and bounded per-process calls."""
import json
import math
from collections import OrderedDict
from threading import RLock

from app.planner.types import Leg
from .http_transport import local_endpoint, request_bytes

UNKNOWN = Leg(minutes=None, km=0.0, source='unknown')


def coordinates(point):
    if len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point):
        raise ValueError
    if not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180):
        raise ValueError
    return tuple(point)


class HttpRouteProvider:
    def __init__(self, endpoint=None, *, timeout_s=2.0, cache_size=512, call_budget=256):
        self.endpoint = local_endpoint(endpoint)
        self.configured = self.endpoint is not None
        self.timeout_s = timeout_s
        self.cache_size, self.call_budget = max(1, cache_size), max(0, call_budget)
        self.calls = 0
        self.reachable = False
        self._cache, self._lock = OrderedDict(), RLock()

    def leg(self, a, b):
        try:
            a, b = coordinates(a), coordinates(b)
            key = (a, b)  # Direction matters; never assume symmetric reachability.
            with self._lock:
                if key in self._cache:
                    self._cache.move_to_end(key)
                    return self._cache[key]
                if not self.configured or self.calls >= self.call_budget:
                    self.reachable = False
                    return UNKNOWN
                self.calls += 1
                # Serialize same-key fetches and quota admission within this bounded local adapter.
                url = (self.endpoint + '/route/v1/foot/' + str(a[1]) + ',' + str(a[0]) + ';'
                       + str(b[1]) + ',' + str(b[0]) + '?overview=false')
                raw = request_bytes(url, deadline_s=self.timeout_s, max_bytes=16384)
                data = json.loads(raw.decode('utf-8'))
                if data.get('code') != 'Ok' or not isinstance(data.get('routes'), list) or not data['routes']:
                    raise ValueError
                route = data['routes'][0]
                seconds, meters = route['duration'], route['distance']
                if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0
                       for v in (seconds, meters)):
                    raise ValueError
                if seconds > 86400 or meters >= 1000000:
                    raise ValueError
                answer = Leg(math.ceil(seconds / 60), meters / 1000, 'provider_route')
                self.reachable = True
                self._cache[key] = answer
                while len(self._cache) > self.cache_size:
                    self._cache.popitem(last=False)
                return answer
        except Exception:
            # Includes malformed coordinates before entering CheckedRouteProvider's own guard.
            self.reachable = False
            return UNKNOWN
