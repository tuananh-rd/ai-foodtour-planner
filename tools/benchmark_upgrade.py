"""Local synthetic benchmark, count-only output; no network/provider calls or secrets."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import logging
import os
from pathlib import Path
import platform
import statistics
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from fastapi.testclient import TestClient
from app.main import create_app
from app.chat.planning import plan_selected
from app.planner.engine import validate_tour
from app.planner.interfaces import StraightLineEstimator
from app.planner.types import Preferences


def run(n=100):
    env = {'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_UI_GUIDED': '1', 'FOODTOUR_LLM': 'off',
           'FOODTOUR_EXPLAIN': 'template', 'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_SESSION_DB': '',
           'FOODTOUR_RATE_LIMIT_IP': '1000000', 'FOODTOUR_RATE_LIMIT_TOKEN': '1000000',
           'FOODTOUR_EVIDENCE_PATH': ''}
    results = []
    with patch.dict(os.environ, env):
        app = create_app(data_path=ROOT / 'contracts/fixtures/venues.chat.synthetic.json')
        logging.getLogger('foodtour.access').disabled = True
        data = app.state.venues.snapshot()
        by = {v.id: v for v in data.venues}
        pool = list(data.venues[:3])
        ids = [v.id for v in pool]
        prefs = Preferences(origin=(pool[0].lat, pool[0].lon), start_time_min=960, duration_min=240, visit_minutes=30)
        routing = StraightLineEstimator()

        def rules(_):
            with TestClient(app) as client:
                session = client.post('/v1/sessions').json()
                response = client.post('/v1/sessions/' + session['session_id'] + '/chat',
                                       headers={'X-Session-Token': session['token']},
                                       json={'revision': session['revision'],
                                             'text': 'Tour 3 quán quanh Hồ Gươm, một tiếng rưỡi chiều nay, ngân sách bốn trăm nghìn cho cả hội 3 người'})
                return response.status_code == 200

        def planning(_):
            tour = plan_selected(by, ids, prefs, routing)
            return bool(tour.stops) and not validate_tour(tour, pool, prefs, routing)

        def measure(fn, i):
            started = time.perf_counter()
            try:
                ok = fn(i)
            except Exception:
                ok = False
            return (time.perf_counter() - started) * 1000, bool(ok)

        for label, fn in [('rules_api_inprocess', rules), ('planning_direct', planning)]:
            cold, cold_ok = measure(fn, -1)
            for concurrency in [1, 5]:
                with ThreadPoolExecutor(max_workers=concurrency) as executor:
                    values = list(executor.map(lambda i: measure(fn, i), range(n)))
                times = sorted(t for t, _ in values)
                results.append({'workload': label, 'concurrency': concurrency, 'n': n,
                                'errors': sum(not ok for _, ok in values), 'cold_ms': round(cold, 3),
                                'cold_ok': cold_ok, 'p50_ms': round(statistics.median(times), 3),
                                'p95_ms': round(times[int(.95 * (n - 1))], 3)})
    return {'synthetic': True, 'live_provider_calls': 0, 'python': platform.python_version(),
            'platform': platform.system(), 'logical_cpus': os.cpu_count(),
            'method': '100 warm samples per workload/concurrency; cold shown separately; errors included in percentile denominator; API measured in-process including synthetic session setup, not network latency',
            'results': results}


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
