"""Record the v1.8 wire on the merged U3 base; synthetic fixtures only."""
import json
import os
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import create_app
from app.repositories.sessions import SessionStore
from app.repositories.llm_budget import DailyLLMBudget

ROOT = Path(__file__).resolve().parents[3]


def record():
    with patch.dict(os.environ, {'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_UI_GUIDED': '0',
            'FOODTOUR_LLM': 'mock', 'FOODTOUR_EXPLAIN': 'template',
            'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_GEOCODER': 'off'}):
        app = create_app(data_path=ROOT/'contracts/fixtures/venues.chat.synthetic.json', sessions=SessionStore())
        app.state.llm_budget = DailyLLMBudget(18)
        client = TestClient(app)
        session = client.post('/v1/sessions').json()
        url = '/v1/sessions/'+session['session_id']
        headers = {'X-Session-Token': session['token']}
        chat = client.post(url+'/chat', headers=headers, json={'revision': 0, 'text': 'hello'}).json()
        clarify = client.post(url+'/chat', headers=headers, json={'revision': 1, 'text': 'xyz'}).json()
        message = client.post(url+'/messages', headers=headers, json={'text': 'hello'}).json()
        return {'chat': chat, 'clarify': clarify, 'messages': message}


if __name__ == '__main__':
    (Path(__file__).parent/'u3_v18_golden.json').write_text(
        json.dumps(record(), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
