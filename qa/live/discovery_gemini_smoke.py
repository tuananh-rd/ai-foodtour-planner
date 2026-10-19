"""Explicitly authorized, bounded native Gemini smoke; sanitized evidence only.

At most three chat turns / six actual model transports (including tool loop).
Uses the existing key/model/caps and durable ledger, stops at the first provider
failure, never retries or substitutes a model, and never exports venue records.
"""
import argparse
import json
import logging
import os
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'backend'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-live', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--prior-evidence', type=Path)
    args = parser.parse_args()
    if not args.allow_live:
        parser.error('Live provider calls require explicit authorization')
    prior = json.loads(args.prior_evidence.read_text(encoding='utf-8')) if args.prior_evidence else {}
    prior_calls = prior.get('model_transport_count', 0) + prior.get('prior_model_transports', 0)
    prior_turns = len(prior.get('turns', [])) + prior.get('prior_chat_turns', 0)
    if args.output.exists() or prior_calls >= 6 or prior_turns >= 3:
        raise SystemExit('BLOCKED: evidence exists or authorized total smoke allowance exhausted')

    from tools.run_online_assistant import local_configuration
    local_configuration()  # allowlisted config, no values printed
    data_path = os.getenv('FOODTOUR_DATA_PATH', '')
    if os.getenv('FOODTOUR_LLM') != 'gemini' or not Path(data_path).is_file():
        raise SystemExit('BLOCKED: existing Gemini/local dataset configuration unavailable')
    # Reuse the established durable ledger; no reset, refund or cap increase.
    os.environ.setdefault('FOODTOUR_BUDGET_DB', str(ROOT / '.venv/online-gemini-budget.sqlite'))
    os.environ.update(FOODTOUR_ROUTING='estimate', FOODTOUR_GEOCODER='off',
                     FOODTOUR_EXPLAIN='template', GOOGLE_MAPS_BROWSER_KEY='',
                     GOOGLE_MAPS_SERVER_KEY='', GOOGLE_MAPS_MAP_ID='')
    from app.llm.provider import ProviderError
    from app.providers import gemini
    from app.discovery.tools import Tools
    from app.discovery.schemas import TOOL_INPUTS
    from unittest.mock import patch
    from fastapi.testclient import TestClient
    from app.main import create_app

    evidence = {'contract': 'discovery-v1', 'dataset': 'private', 'live': True,
                'limits': {'chat_turns': 3, 'model_transports': 6, 'automatic_retries': 0},
                'transports': [], 'turns': [], 'tools': [], 'outcome': 'blocked'}
    evidence.update(prior_model_transports=prior_calls, prior_chat_turns=prior_turns)
    transport = gemini.request_bytes
    tool_run = Tools.run

    def bounded_transport(url, **kwargs):
        if len(evidence['transports']) + prior_calls >= 6:
            raise ProviderError('quota')
        # Only the configured official native Gemini endpoint is permitted.
        if not url.startswith(gemini.OFFICIAL_BASE + '/v1beta/models/'):
            raise ProviderError('unavailable')
        body = json.loads(kwargs['body'])
        contents = body.get('contents', [])
        projected = json.dumps(contents, ensure_ascii=False)
        if len(projected.encode('utf-8')) > 12000:
            raise ProviderError('bad_response')
        # Tools may return at most five projected results and no raw GPS/health.
        def private_fields(value):
            if isinstance(value, dict):
                return bool(set(value) & {'lat', 'lon', 'origin', 'allergies'}) or any(private_fields(v) for v in value.values())
            return isinstance(value, list) and any(private_fields(v) for v in value)
        for entry in contents:
            for part in entry.get('parts', []):
                response = part.get('functionResponse', {}).get('response')
                if response and private_fields(response):
                    raise ProviderError('bad_response')
        record = {'number': len(evidence['transports']) + 1, 'http_status': None,
                  'input_bytes': len(projected.encode('utf-8'))}
        evidence['transports'].append(record)
        try:
            raw = transport(url, **kwargs)
            data = json.loads(raw)
            record['http_status'] = 200
            version = data.get('modelVersion')
            record['response_model'] = version if isinstance(version, str) and re.fullmatch(r'[a-zA-Z0-9.\-]{1,100}', version) else None
            candidates = data.get('candidates') or []
            candidate = candidates[0] if candidates else {}
            finish = candidate.get('finishReason')
            record['finish_reason'] = finish if finish in ('STOP', 'MAX_TOKENS', 'SAFETY', 'OTHER', None) else 'other'
            parts = candidate.get('content', {}).get('parts', [])
            record['native_tools'] = [p['functionCall']['name'] for p in parts
                                      if isinstance(p, dict) and isinstance(p.get('functionCall'), dict)
                                      and p['functionCall'].get('name') in TOOL_INPUTS]
            record['has_text'] = any(isinstance(p.get('text'), str) and not p.get('thought') for p in parts if isinstance(p, dict))
            return raw
        except ProviderError as error:
            record.update(http_status=error.status, error_kind=error.kind)
            raise

    def tracked_tool(self, name, arguments):
        result = tool_run(self, name, arguments)
        evidence['tools'].append({'name': name if name in TOOL_INPUTS else 'unknown',
                                  'status': result.get('status')})
        return result

    logging.disable(logging.CRITICAL)
    with tempfile.TemporaryDirectory(prefix='discovery-live-smoke-') as temp:
        os.environ['FOODTOUR_SESSION_DB'] = str(Path(temp) / 'sessions.sqlite')
        app = create_app()
        dataset = app.state.venues.snapshot()
        if dataset.dataset_source != 'private':
            raise SystemExit('BLOCKED: local dataset did not load as private')
        evidence['dataset_count'] = len(dataset.venues)
        model = app.state.discovery_model
        if not model.configured:
            raise SystemExit('BLOCKED: configured native Gemini client unavailable')
        evidence['configured_model'] = model.client.model
        evidence['budget_before'] = {k: v for k, v in model.client.budget.snapshot().items()
                                     if k in ('limit', 'used', 'remaining', 'exhausted')}
        evidence['session_cap'] = app.state.llm_session_cap
        evidence['reserve'] = app.state.llm_reserve
        with patch.object(gemini, 'request_bytes', bounded_transport), patch.object(Tools, 'run', tracked_tool), TestClient(app) as client:
            session = client.post('/v1/sessions', json={}).json()
            headers = {'X-Session-Token': session['token']}
            path = '/v1/sessions/' + session['session_id'] + '/assistant'
            revision = session['revision']
            # Public landmarks/food requests, no personal location/health input.
            for text in ('Chào bạn', 'Tìm quán quanh Xuân Thủy', 'So sánh A với B')[prior_turns:]:
                before = len(evidence['transports'])
                response = client.post(path, headers=headers, json={'revision': revision, 'text': text})
                body = response.json()
                provider = body.get('provider', {})
                evidence['turns'].append({'number': len(evidence['turns']) + 1,
                    'http_status': response.status_code, 'status': body.get('status'),
                    'provider': {k: provider.get(k) for k in ('mode', 'calls', 'reason')},
                    'actual_model_transports': len(evidence['transports']) - before,
                    'results_count': len(body.get('results', [])),
                    'comparison_count': len((body.get('comparison') or {}).get('venues', [])),
                    'has_reply': bool((body.get('reply') or {}).get('text'))})
                revision = body.get('revision', revision)
                # Stop, not retry, on provider errors or admission refusal/fallback.
                failed = any(x.get('error_kind') for x in evidence['transports'][before:])
                if failed or response.status_code != 200 or provider.get('mode') != 'gemini' or provider.get('reason'):
                    break
            evidence['budget_after'] = {k: v for k, v in model.client.budget.snapshot().items()
                                        if k in ('limit', 'used', 'remaining', 'exhausted')}
    has_error = any(x.get('error_kind') for x in evidence['transports'])
    success = bool(evidence['transports']) and not has_error and all(
        x['http_status'] == 200 and x['provider']['mode'] == 'gemini' and not x['provider']['reason'] for x in evidence['turns'])
    evidence['outcome'] = 'live_success' if success else 'blocked_or_partial'
    evidence['model_transport_count'] = len(evidence['transports'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, ensure_ascii=False))
    return 0 if success else 2


if __name__ == '__main__':
    raise SystemExit(main())
