"""Actual local synthetic HTTP journey; private lane GET-only, no model/search calls."""
import json
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
evidence = {'checks': [], 'transcript': [], 'provider_requests': 0}


def request(base, path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Session-Token'] = token
    req = Request(base+path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
    try:
        with urlopen(req, timeout=10) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)


def check(name, passed):
    evidence['checks'].append({'name': name, 'pass': bool(passed)})
    if not passed:
        raise AssertionError(name)


def main():
    api = 'http://127.0.0.1:8230'
    _, health = request(api, '/health')
    evidence['backend_commit'] = health['build_commit']
    check('Synthetic/rules explicit and web disabled', health['dataset_source'] == 'synthetic' and
          health['llm_provider'] == 'rules' and not health['web_search_configured'])
    _, session = request(api, '/v1/sessions', {})
    path = '/v1/sessions/'+session['session_id']+'/assistant'
    token = session['token']
    check('Session ownership before tools', request(api, path)[0] == 401)

    def post(payload):
        _, current = request(api, path, token=token)
        status, body = request(api, path, {'revision': current['revision'], **payload}, token)
        check('HTTP action accepted', status == 200)
        check('Zero provider requests', body['provider']['calls'] == 0)
        evidence['transcript'].append({'input': payload.get('text') or payload['action']['type'],
            'status': body['status'], 'reply': body['reply'], 'result_count': len(body['results']),
            'selected_count': len(body['selection']), 'origin_status': body['location']['status']})
        return body

    def action(kind, args):
        return post({'action': {'type': kind, 'arguments': args}})

    def tool(name, args):
        return post({'action': {'type': 'tool', 'name': name, 'arguments': args}})

    hello = post({'text': 'Chào bạn'})
    check('General chat before origin without form', hello['reply']['question'] is None and hello['profile']['origin'] is None)
    missing = post({'text': 'tôi muốn ăn phở với tráng miệng ở hai bà trưng'})
    check('One origin question, no permission denial or implicit origin', bool(missing['reply']['question']) and
          not missing['results'] and missing['profile']['origin'] is None and
          'chưa được người dùng cho phép' not in missing['reply']['text'])
    resolved = action('location', {'operation': 'resolve', 'query': 'Hồ'})
    check('Ambiguous local input requires explicit choice', len(resolved['location']['candidates']) > 1 and resolved['profile']['origin'] is None)
    chosen = action('location', {'operation': 'choose', 'candidate_id': resolved['location']['candidates'][0]['id']})
    check('Chosen origin resumes query and retains foods/area', chosen['profile']['origin'] is not None and
          set(chosen['profile']['foods']) == {'phở', 'tráng miệng'} and ''.join(c for c in
          unicodedata.normalize('NFD', chosen['profile']['area'].lower()) if not unicodedata.combining(c)) == 'hai ba trung')
    check('Results honor district membership', chosen['status'] == 'ok' and bool(chosen['results']) and
          all(x['district'] == 'Hai Bà Trưng' for x in chosen['results']))
    empty = post({'text': 'Tìm phở ở Khu thử nghiệm không tồn tại'})
    check('No data distinct from denied/tool failure', empty['status'] == 'no_results' and not empty['results'])
    action('location', {'operation': 'coordinates', 'lat': 21.0285, 'lon': 105.8522, 'source': 'coordinates'})
    found = post({'text': 'Tìm phở và chè quanh Hồ Gươm'})
    check('Actual fixture results with backend Haversine', len(found['results']) >= 2 and
          all(x['distance_m'] is not None and x['distance_source'] == 'haversine' for x in found['results']))
    combined = post({'text': 'So sánh A với B và thêm A vào chuyến đi'})
    check('Compare two, explicitly select only A', len(combined['comparison']['venues']) == 2 and
          [x['id'] for x in combined['selection']] == [found['results'][0]['id']])
    ids = [x['id'] for x in found['results'][:3]]
    selected = tool('update_foodtour_selection', {'operation': 'add', 'venue_ids': ids,
                    'selection_version': combined['selection_version']})
    check('Explicit selection only; no automatic itinerary', len(selected['selection']) == 3 and selected['tour'] is None)
    post({'text': '600 nghìn cả nhóm cho 2 người, 20 phút mỗi chặng'})
    post({'text': 'Bắt đầu lúc 18h, tổng 240 phút, đi bộ'})
    ready = tool('create_itinerary', {})
    check('Versioned confirmation before planner', ready['confirmation'] is not None and ready['tour'] is None)
    confirmed = post({'action': {'type': 'confirm', 'confirmation_id': ready['confirmation']['id']}})
    check('Real planner creates ordered tour', bool(confirmed['tour'] and confirmed['tour']['stops']))
    status, maps = request(api, path.removesuffix('/assistant')+'/tour/maps-links', token=token)
    check('Free Google Maps URL route available', status == 200 and bool(maps['links']) and not maps['uses_api'])
    query = parse_qs(urlsplit(maps['links'][0]['url']).query)
    origin = confirmed['profile']['origin']
    check('Maps actual origin and walking mode', query['origin'] == [f"{origin['lat']:.6f},{origin['lon']:.6f}"] and query['api'] == ['1'] and query['travelmode'] == ['walking'])
    check('All Maps URLs bounded HTTPS', all(urlsplit(x['url']).netloc == 'www.google.com' and
          x['url'].startswith('https://www.google.com/maps/dir/?api=1') and len(x['url']) <= 2048 and x['waypoint_count'] <= 3 for x in maps['links']))
    old_selection = [x['id'] for x in confirmed['selection']]
    moved = action('location', {'operation': 'coordinates', 'lat': 21.032, 'lon': 105.856, 'source': 'coordinates'})
    check('Origin change invalidates tour but preserves chosen order', moved['tour'] is None and moved['confirmation'] is None and
          [x['id'] for x in moved['selection']] == old_selection)
    enabled = action('settings', {'web_search_enabled': True})
    unavailable = post({'text': 'Tìm phở quanh Hồ Gươm'})
    check('Opt-in web unavailable safely, local discovery remains', unavailable['web']['status'] == 'unavailable' and bool(unavailable['results']))
    action('settings', {'web_search_enabled': False})
    cleared = action('location', {'operation': 'clear'})
    check('Clear origin shows unknown distance, no zero fallback', cleared['profile']['origin'] is None and
          all(x['distance_m'] is None for x in cleared['selection']))
    _, private = request('http://127.0.0.1:8320', '/health')
    _, capabilities = request('http://127.0.0.1:8320', '/v1/assistant/capabilities')
    evidence['private_bootstrap'] = {'source': private['dataset_source'], 'mode': private['llm_provider'],
        'models': capabilities['chat_models'], 'web': capabilities['web_search']}
    check('Private bootstrap honest configured/quota, no candidate3.1 option', private['dataset_source'] == 'private' and
          all(m['id'] != 'gemini-3.1-flash-lite' and not m['available'] and m['reason'] == 'quota' for m in capabilities['chat_models']))
    check('Web free eligibility unverified', not capabilities['web_search']['available'])
    print(json.dumps({'checks': len(evidence['checks']), 'passed': sum(x['pass'] for x in evidence['checks'])}))


if __name__ == '__main__':
    try:
        main()
    finally:
        (ROOT/'docs/reports/discovery-upgrade-api.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
