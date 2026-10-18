"""Count/slot-only HTTP diagnostics; never export session or private venue records."""
import json
import urllib.request

TEXT = 'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'


def run(port):
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
    for label, message in [('exact-user-input', TEXT), ('budget-scope', 'cả nhóm'), ('start-time', '19h'),
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
    for api_port in (8020, 8040):
        for row in run(api_port):
            print(json.dumps(row, ensure_ascii=False))
