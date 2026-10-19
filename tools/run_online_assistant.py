"""Local-only API launcher; secrets remain process-internal, never printed."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def local_configuration():
    # Explicit allowlist: never import paid Maps keys or arbitrary executable .env content.
    allowed = {'GEMINI_API_KEY', 'FOODTOUR_LLM', 'FOODTOUR_GEMINI_MODEL', 'FOODTOUR_LLM_DAILY_BUDGET',
        'FOODTOUR_BUDGET_DB', 'FOODTOUR_LLM_SESSION_CAP', 'FOODTOUR_LLM_RESERVE',
        'FOODTOUR_DATA_PATH', 'FOODTOUR_EVIDENCE_PATH'}
    path = ROOT / 'backend/.env'
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        if key.strip() in allowed:
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8060)
    parser.add_argument('--web-port', type=int, default=3060)
    parser.add_argument('--dataset', choices=('synthetic', 'local'), default='synthetic')
    parser.add_argument('--llm', choices=('off', 'existing'), default='off')
    args = parser.parse_args()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', args.port))  # Refuse occupied port; never stop its owner.
    local_configuration()
    os.environ.update(FOODTOUR_CHAT_V2='1', FOODTOUR_UI_GUIDED='1', FOODTOUR_UI_V2='1',
        FOODTOUR_ROUTING='estimate', FOODTOUR_GEOCODER='off', FOODTOUR_EXPLAIN='template',
        GOOGLE_MAPS_BROWSER_KEY='', GOOGLE_MAPS_SERVER_KEY='', GOOGLE_MAPS_MAP_ID='',
        WEB_ORIGIN=f'http://localhost:{args.web_port},http://127.0.0.1:{args.web_port}')
    local_dir = ROOT / '.venv'
    local_dir.mkdir(exist_ok=True)
    os.environ['FOODTOUR_SESSION_DB'] = str(local_dir / ('online-' + args.dataset + '-sessions.sqlite'))
    os.environ.setdefault('FOODTOUR_BUDGET_DB', str(local_dir / 'online-gemini-budget.sqlite'))
    try:
        configured_limit = int(os.environ.get('FOODTOUR_LLM_DAILY_BUDGET', '18'))
    except ValueError:
        configured_limit = 0
    os.environ['FOODTOUR_LLM_DAILY_BUDGET'] = str(max(0, min(18, configured_limit)))
    if args.llm == 'off':
        os.environ['FOODTOUR_LLM'] = 'mock'
    if args.dataset == 'synthetic':
        os.environ['FOODTOUR_DATA_PATH'] = str(ROOT / 'contracts/fixtures/venues.chat.synthetic.json')
        os.environ['FOODTOUR_EVIDENCE_PATH'] = ''
    elif not os.environ.get('FOODTOUR_DATA_PATH') or not Path(os.environ['FOODTOUR_DATA_PATH']).is_file():
        raise SystemExit('Local dataset not configured; no synthetic result is labelled local.')
    sys.path.insert(0, str(ROOT / 'backend'))
    from app.main import create_app
    app = create_app()
    app.state.build_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
