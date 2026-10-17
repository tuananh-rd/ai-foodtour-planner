"""Pipeline observations must distinguish attempts/success and never contain user data."""
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import create_app

ROOT = Path(__file__).resolve().parents[3]


class Telemetry(unittest.TestCase):
    def test_chat_event_is_allowlisted_and_private(self):
        with patch.dict(os.environ, {'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_UI_GUIDED': '1',
                                    'FOODTOUR_LLM': 'off', 'FOODTOUR_EXPLAIN': 'template',
                                    'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_SESSION_DB': ''}):
            client = TestClient(create_app(data_path=ROOT / 'contracts/fixtures/venues.chat.synthetic.json'))
            s = client.post('/v1/sessions').json()
            text = 'Mình muốn tour 3 quán quanh Hồ Gươm, thời gian 120 phút'
            with self.assertLogs('foodtour.access', level='INFO') as logs:
                response = client.post('/v1/sessions/' + s['session_id'] + '/chat',
                                       headers={'X-Session-Token': s['token']},
                                       json={'revision': s['revision'], 'text': text})
            self.assertEqual(response.status_code, 200)
            record = json.loads(logs.records[-1].getMessage())
            self.assertEqual(record['provider_attempted'], 0)
            self.assertEqual(record['provider_validated'], 0)
            self.assertEqual(record['understanding'], 'rules')
            self.assertGreaterEqual(record['extraction_ms'], 0)
            self.assertNotIn('planner_checked', record)
            self.assertEqual(record['route'], '/v1/sessions/{session_id}/chat')
            for value in (text, s['token'], s['session_id'], 'Hồ Gươm'):
                self.assertNotIn(value, logs.records[-1].getMessage())
