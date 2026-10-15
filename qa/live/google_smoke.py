"""Opt-in Google smoke: three PUBLIC Hanoi landmarks, aggregate output only.

Run from repository root: .venv/Scripts/python.exe qa/live/google_smoke.py
Reads only environment / ignored backend/.env. Exit 2 without a server key.
Never prints keys, URLs, queries, coordinates, provider bodies or venue data.
"""
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))


def main():
    from app.config import load_local_env
    load_local_env()
    if not os.getenv('GOOGLE_MAPS_SERVER_KEY', '').strip():
        print(json.dumps({'status': 'unavailable', 'reason': 'server_key_absent', 'calls': 0}))
        return 2
    from app.providers.google_maps import GoogleRoutesProvider, GoogleGeocoder
    # Public landmark coordinates: Hoan Kiem lake, St Joseph cathedral, Hanoi Opera House.
    points = [(21.0285, 105.8522), (21.0287, 105.8490), (21.0243, 105.8577)]
    routing, geocoder = GoogleRoutesProvider(), GoogleGeocoder()
    prepared = routing.prepare(points)
    known = sum(routing.leg(a, b).source == 'provider_route' for a, b in zip(points, points[1:]))
    geometry = routing.geometry(points)
    result = geocoder.geocode('Hanoi Opera House, Hanoi, Vietnam')
    ok = bool(prepared and known == 2 and geometry and len(geometry) == 2 and result['status'] == 'ok')
    print(json.dumps({'status': 'ok' if ok else 'failed', 'matrix_prepared': prepared,
        'known_legs': known, 'geometry_legs': len(geometry or []), 'warnings': len(routing.warnings(points)),
        'geocode_status': result['status'], 'geocode_results': len(result['results']),
        'routing_calls': routing.calls_today, 'geocode_calls': geocoder.budget.calls_today,
        'routing_error': routing.last_error, 'geocode_error': geocoder.last_error}))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
