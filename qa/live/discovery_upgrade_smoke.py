"""NEW user-authorized smoke: max3 user turns/6 transports, no retry, stop on first failure.

Uses real local data, actual app routes and native Gemini. No private records,
coordinates, keys, raw requests or raw provider replies are written to evidence.
"""
import argparse
import json
import logging
import os
from pathlib import Path
import re
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT/'backend'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-live', action='store_true')
    args = parser.parse_args()
    output = ROOT/'docs/reports/discovery-upgrade-live.json'
    if not args.allow_live or output.exists():
        raise SystemExit('Explicit live authorization required; existing evidence may never be replayed')
    from tools.run_online_assistant import local_configuration
    local_configuration()
    metadata = json.loads((ROOT/'docs/reports/discovery-upgrade-model-metadata.json').read_text(encoding='utf8'))
    candidate = 'gemini-3.1-flash-lite'
    if not any(x['id'] == candidate and x['generate_content'] for x in metadata.get('models', [])):
        raise SystemExit('Candidate absent from actual key-scoped models metadata; no invented model probe')
    os.environ.update(FOODTOUR_LLM_DAILY_BUDGET=str(min(18, int(os.getenv('FOODTOUR_LLM_DAILY_BUDGET', '18')))),
        FOODTOUR_BUDGET_DB=str(ROOT/'.venv/online-gemini-budget.sqlite'), FOODTOUR_CHAT_V2='1',
        FOODTOUR_ROUTING='estimate', FOODTOUR_GEOCODER='off', FOODTOUR_EXPLAIN='template',
        FOODTOUR_TAVILY_ENABLED='0', GOOGLE_MAPS_BROWSER_KEY='', GOOGLE_MAPS_SERVER_KEY='', GOOGLE_MAPS_MAP_ID='')
    if os.getenv('FOODTOUR_LLM') != 'gemini' or not Path(os.getenv('FOODTOUR_DATA_PATH', '')).is_file():
        raise SystemExit('Existing Gemini/local configuration unavailable')
    logging.disable(logging.CRITICAL)
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.providers import gemini
    from app.discovery.experience import VERIFIED_MODELS
    from app.discovery.tools import Tools
    from app.llm.provider import ProviderError
    from app.planner.relevance import fold_uncached
    evidence = {'scope': 'new upgrade allowance', 'max_user_turns': 3, 'max_model_requests': 6,
        'automatic_retries': 0, 'dataset': 'private', 'transports': [], 'turns': [], 'tools': [],
        'candidate_verification_only': candidate, 'outcome': 'in_progress'}
    def save(): output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    save()  # Durable fence before any model request; a restarted worker cannot replay.
    transport, run_tool = gemini.request_bytes, Tools.run
    def observed_transport(url, **kwargs):
        if ':generateContent' not in url or len(evidence['transports']) >= 6:
            raise ProviderError('quota')
        row = {'number': len(evidence['transports'])+1, 'requested_model': url.split('/models/')[-1].split(':')[0]}
        evidence['transports'].append(row); save()
        try:
            data = transport(url, **kwargs)
            raw = json.loads(data)
            choice = raw.get('candidates', [{}])[0]
            row.update(http_status=200, response_model=raw.get('modelVersion'), finish_reason=choice.get('finishReason'),
                native_tools=[p['functionCall']['name'] for p in choice.get('content', {}).get('parts', []) if 'functionCall' in p])
            save(); return data
        except ProviderError as error:
            row.update(http_status=getattr(error, 'status', None), reason=error.kind)
            save(); raise
    def observed_tool(self, name, arguments):
        result = run_tool(self, name, arguments)
        evidence['tools'].append({'name': name, 'status': result['status'],
                                  'result_count': len(result.get('restaurants', []))})
        return result
    try:
        with tempfile.TemporaryDirectory() as temp:
            os.environ['FOODTOUR_SESSION_DB'] = str(Path(temp)/'upgrade-smoke.sqlite')
            app = create_app()
            model = app.state.discovery_model.client
            evidence['budget_before'] = model.budget.snapshot()
            evidence['configured_model'] = model.model
            usable = min(6, app.state.llm_session_cap,
                         evidence['budget_before']['remaining'] - app.state.llm_reserve)
            turns_allowed = min(3, usable//2)
            evidence['planned_user_turns'] = turns_allowed
            evidence['quota_limited'] = turns_allowed < 3
            if turns_allowed < 1:
                raise ProviderError('insufficient_quota')
            with TestClient(app) as client, patch('app.providers.gemini.request_bytes', observed_transport), patch.object(Tools, 'run', observed_tool):
                session = client.post('/v1/sessions', json={}).json()
                url = '/v1/sessions/'+session['session_id']+'/assistant'
                headers = {'X-Session-Token': session['token']}
                def post(payload):
                    current = client.get(url, headers=headers).json()
                    response = client.post(url, headers=headers, json={'revision': current['revision'], **payload})
                    if response.status_code != 200: raise ProviderError('application_error')
                    return response.json()
                def tool(name, arguments):
                    return post({'action': {'type': 'tool', 'name': name, 'arguments': arguments}})
                # Public landmark only; no personal GPS/health. Recreate the stale
                # area + two selected venues from the screenshot without exporting them.
                post({'action': {'type': 'location', 'arguments': {'operation': 'coordinates',
                     'lat': 21.0285, 'lon': 105.8522, 'source': 'coordinates'}}})
                tool('update_preferences', {'patch': {'area': 'Phố cổ'}})
                found = tool('search_restaurants', {'area': 'Phố cổ'})
                if len(found['results']) < 2: raise ProviderError('insufficient_fixture_results')
                chosen = [r['id'] for r in found['results'][:2]]
                before = tool('update_foodtour_selection', {'operation': 'add', 'venue_ids': chosen,
                              'selection_version': found['selection_version']})
                evidence['initial_selected_count'] = len(before['selection'])
                messages = ['tôi muốn ăn phở với tráng miệng ở hai bà trưng',
                            'Tìm phở và chè quanh Xuân Thủy, giữ nguyên quán đã chọn',
                            'So sánh A với B và thêm A vào chuyến đi']
                # Candidate enters only this isolated verifier, not public runtime.
                with patch.dict(VERIFIED_MODELS, {candidate: 'Gemini 3.1 Flash Lite (verification)'}):
                    for index, text in enumerate(messages[:turns_allowed]):
                        if index == 0:
                            changed = post({'action': {'type': 'settings', 'arguments': {'chat_model': candidate}}})
                            if changed['settings']['chat_model'] != candidate: raise ProviderError('candidate_selection_failed')
                        offset = len(evidence['transports'])
                        body = post({'text': text})
                        answer = body['reply']['text']
                        folded = fold_uncached(answer)
                        flags = {'no_permission_denial': 'chua duoc nguoi dung cho phep' not in folded,
                                 'no_auto_tour': body['tour'] is None and body['confirmation'] is None,
                                 'useful_reply': len(answer.strip()) >= 20,
                                 'actual_native_tools': any(r.get('native_tools') for r in evidence['transports'][offset:])}
                        if index == 0:
                            flags.update(area_updated=fold_uncached(body['profile']['area']) == 'hai ba trung',
                                         compounds_remembered=set(body['profile']['foods']) == {'phở', 'tráng miệng'},
                                         selection_preserved=[r['id'] for r in body['selection']] == chosen)
                        elif index == 1:
                            flags.update(area_updated=fold_uncached(body['profile']['area']) == 'xuan thuy',
                                         real_search_results=len(body['results']) >= 2,
                                         selection_preserved=[r['id'] for r in body['selection']] == chosen)
                        else:
                            flags.update(compared_real_ids=bool(body['comparison'] and len(body['comparison']['venues']) == 2),
                                         explicit_selection_added=len(body['selection']) == 3)
                        # Inspect full reply in memory; save only a redacted rendering.
                        clean = answer
                        for venue in app.state.venues.snapshot().venues:
                            for value in (venue.name, venue.address, venue.source_url, venue.id):
                                if isinstance(value, str) and len(value) >= 4:
                                    clean = clean.replace(value, '[local record]')
                        clean = re.sub(r'\d+', '[number]', clean)[:1200]
                        evidence['turns'].append({'number': index+1, 'provider': body['provider'],
                            'status': body['status'], 'results_count': len(body['results']),
                            'selected_count': len(body['selection']), 'quality_flags': flags,
                            'reply_redacted': clean, 'question_count': int(bool(body['reply']['question']))})
                        save()
                        if body['provider']['mode'] != 'gemini' or body['provider'].get('reason'):
                            raise ProviderError(body['provider'].get('reason') or 'provider_fallback')
                        if not all(flags.values()): raise ProviderError('semantic_quality_failed')
                evidence['budget_after'] = model.budget.snapshot()
                evidence['outcome'] = 'native_and_semantic_success'
    except Exception as error:
        evidence['outcome'] = 'blocked'
        evidence['reason'] = getattr(error, 'kind', type(error).__name__)
        if 'model' in locals():
            evidence['budget_after'] = model.budget.snapshot()
        evidence['natural_model_reply_completed'] = False
        evidence['live_chat_quality'] = 'NOT PASSED: provider or semantic validation did not complete; no retries'
    save()
    print(json.dumps({'outcome': evidence['outcome'], 'reason': evidence.get('reason'),
                      'turns': len(evidence['turns']), 'model_requests': len(evidence['transports'])}))
    return 0 if evidence['outcome'] == 'native_and_semantic_success' else 1


if __name__ == '__main__':
    raise SystemExit(main())
