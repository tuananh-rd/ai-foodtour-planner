"""Real synthetic API with explicitly mocked external search results; local QA only."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import socket
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--web-port', type=int, default=3060)
    args = parser.parse_args()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', args.port))
    # Do not load dotenv or retain inherited external credentials in this process.
    for name in list(os.environ):
        if any(part in name for part in ('KEY', 'SECRET', 'TOKEN')) and not name.startswith('FOODTOUR_RATE'):
            os.environ.pop(name, None)
    scratch = Path(tempfile.mkdtemp(prefix='foodtour-search-fixture-'))
    os.environ.update(FOODTOUR_CHAT_V2='1', FOODTOUR_UI_GUIDED='1', FOODTOUR_UI_V2='1',
        FOODTOUR_LLM='mock', FOODTOUR_EXPLAIN='template', FOODTOUR_GEOCODER='off',
        FOODTOUR_ROUTING='estimate', FOODTOUR_TAVILY_ENABLED='0',
        FOODTOUR_SESSION_DB=str(scratch / 'sessions.sqlite'),
        FOODTOUR_DATA_PATH=str(ROOT / 'contracts/fixtures/venues.chat.synthetic.json'),
        FOODTOUR_EVIDENCE_PATH='', WEB_ORIGIN=f'http://127.0.0.1:{args.web_port}')
    sys.path.insert(0, str(ROOT / 'backend'))
    from app.main import create_app
    from app.providers.search_safety import public_food_query

    class ExternalFixture:
        configured = True

        def __init__(self):
            self.calls = 0
            self.timestamp = datetime.now(timezone.utc).isoformat()

        def search(self, query, *, deadline_s=6):
            self.calls += 1
            result = dict(status='ok', sources=[], fetched_at=None, credits=0, cached=False)
            if public_food_query(query) is None:
                return dict(result, status='rejected')
            if 'quota' in query:
                return dict(result, status='quota')
            if 'offline' in query:
                return dict(result, status='unavailable')
            if 'unsafe-source' in query:
                return dict(result, sources=[dict(title='[MOCK EXTERNAL] Invalid URL',
                    url='https://127.0.0.1/', snippet='Synthetic rejected source.')])
            return dict(result, credits=0 if 'cache' in query else 1,
                cached='cache' in query, fetched_at=self.timestamp, sources=[dict(
                    title='[MOCK EXTERNAL] <img src=x onerror="window.fixtureExecuted=true">',
                    url='https://example.com/synthetic-food-quote',
                    snippet='Synthetic quoted text for citation rendering QA; no venue facts are asserted.')])

    fixture = ExternalFixture()
    app = create_app(web_search=fixture)

    @app.get('/qa/search-fixture')
    def metadata():
        return dict(mode='mocked-external-provider', dataset='synthetic',
            adapter_calls=fixture.calls, external_network_calls=0)

    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
