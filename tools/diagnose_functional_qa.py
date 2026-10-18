"""Count/slot-only HTTP diagnostics; never export session or private venue records."""
import json
import urllib.request

TEXT = 'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'


def run(port, messages=None):
    base = f'http://127.0.0.1:{port}'

    def request(path, body=None, token=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['X-Session-Token'] = token
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        with urllib.request.urlopen(urllib.request.Request(base + path, data=data, headers=headers), timeout=15) as response:
            return json.load(response)

    session = request('/v1/sessions', {})
    revision = session['revision']
    rows = []
    for label, message in messages or [('exact-user-input', TEXT), ('budget-scope', 'cả nhóm'), ('start-time', '19h'),
                                      ('budget-edit', 'đổi ngân sách thành 300 nghìn mỗi người')]:
        response = request('/v1/sessions/' + session['session_id'] + '/chat',
                           {'revision': revision, 'text': message}, session['token'])
        revision = response['revision']
        chat = response.get('chat', {})
        safe = {key: value for key, value in chat.get('profile', {}).items()
                if key in ('duration_min', 'party_size', 'budget', 'budget_scope', 'stops', 'max_leg_min', 'start_time')}
        pending = chat.get('pending') or {}
        rows.append({'port': port, 'turn': label, 'profile': safe, 'pendingKind': pending.get('kind'),
                     'pendingSlot': pending.get('slot'), 'tourPresent': response.get('tour') is not None,
                     'stopCount': len((response.get('tour') or {}).get('stops', []))})
    return rows


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ports', nargs='+', type=int, default=[8020, 8040])
    parser.add_argument('--no-allergy-compound', action='store_true')
    args = parser.parse_args()
    messages = [('compound-no-allergy', 'Tour ba quán quanh Hồ Gươm tối nay một tiếng rưỡi, năm trăm nghìn cả hội cho hai người, không dị ứng gì'),
                ('start-time', '19h')] if args.no_allergy_compound else None
    for api_port in args.ports:
        for row in run(api_port, messages):
            print(json.dumps(row, ensure_ascii=False))
