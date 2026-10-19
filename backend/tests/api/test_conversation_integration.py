"""New conversation wiring: real HTTP state/revision boundaries, stubbed external quality."""
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import create_app
from app.chat.conversation_reply import decorate_reply
from app.chat.engine import TurnResult
from app.chat.state import ChatState, Pending
from app.planner.types import Preferences


class AssistantStub:
    def __init__(self, text='Bonjour', status='ok'):
        self.text, self.status, self.calls = text, status, []

    def respond(self, *args, **kwargs):
        self.calls.append(args)
        return SimpleNamespace(status=self.status, text=self.text, provider='gemini', llm_calls=1)


class ConversationIntegration(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_UI_GUIDED': '1',
            'FOODTOUR_LLM': 'off', 'FOODTOUR_EXPLAIN': 'template', 'FOODTOUR_GEOCODER': 'off',
            'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_SESSION_DB': '', 'FOODTOUR_RATE_LIMIT_IP': '10000'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def result(self):
        state = ChatState()
        state.pending = Pending('p', 'clarify_slot', slot='budget')
        return TurnResult(state, Preferences(), [
            {'type': 'notice', 'level': 'warning', 'code': 'allergy', 'text': 'Do not remove safety'},
            {'type': 'text', 'text': 'Budget question?'},
            {'type': 'clarify', 'pending_id': 'p'}], 'UPDATE_PROFILE')

    def decorate(self, assistant, result, **kwargs):
        return decorate_reply(assistant, result, 'hello', [], budget=kwargs.get('budget'),
            session_cap=kwargs.get('cap', 6), reserve=3)

    def test_preserves_question_warning_and_private_projection(self):
        result, assistant = self.result(), AssistantStub('Mình đã ghi nhận thay đổi của bạn.')
        result.state.profile['area'].value = {'lat': 21.0, 'lon': 105.0}
        before = list(result.blocks)
        meta = self.decorate(assistant, result)
        self.assertEqual(meta['llm_calls'], 1)
        self.assertEqual(result.blocks[1:], before)
        self.assertEqual(result.state.pending.pending_id, 'p')
        self.assertNotIn('area', assistant.calls[0][2]['profile'])
        self.assertEqual(result.state.llm_used, 1)

    def test_no_extra_pending_question_or_call_after_understanding(self):
        result, assistant = self.result(), AssistantStub('Bạn đi đâu?')
        before = list(result.blocks)
        self.assertEqual(self.decorate(assistant, result)['status'], 'rejected')
        self.assertEqual(result.blocks, before)
        result.llm_calls = 1
        self.assertEqual(self.decorate(assistant, result)['status'], 'skipped')
        self.assertEqual(len(assistant.calls), 1)

    def test_session_daily_reserve_and_failure_preserve_reply(self):
        for budget, cap in (({'remaining': 3}, 6), (None, 0), ({'exhausted': True}, 6)):
            assistant, result = AssistantStub(), self.result()
            self.decorate(assistant, result, budget=budget, cap=cap)
            self.assertEqual(assistant.calls, [])
        result, assistant = self.result(), AssistantStub(status='quota')
        before = list(result.blocks)
        self.assertEqual(self.decorate(assistant, result)['status'], 'quota')
        self.assertEqual(result.blocks, before)

    def test_http_revision_restore_and_no_plan_from_conversation(self):
        assistant = AssistantStub('Mình có thể giúp bạn chuẩn bị chuyến ăn uống.')
        fixture = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.chat.synthetic.json'
        client = TestClient(create_app(data_path=fixture, conversational_assistant=assistant))
        session = client.post('/v1/sessions').json()
        url = '/v1/sessions/' + session['session_id']
        headers = {'X-Session-Token': session['token']}
        response = client.post(url + '/chat', headers=headers, json={'revision': 0, 'text': 'xin chào'})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload['assistant']['status'], 'ok')
        self.assertIsNone(payload['tour'])
        self.assertEqual(client.get(url, headers=headers).json()['revision'], payload['revision'])
        conflict = client.post(url + '/chat', headers=headers, json={'revision': 0, 'text': 'xin chào'})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(len(assistant.calls), 1)

    def test_sensitive_turn_keeps_allergy_local_and_never_calls_provider(self):
        assistant = AssistantStub('Mình đã ghi nhận.')
        understander = SimpleNamespace(understand=lambda *args: self.fail('Sensitive turn reached LLM classifier'))
        fixture = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.chat.synthetic.json'
        client = TestClient(create_app(data_path=fixture, conversational_assistant=assistant, chat_understander=understander))
        session = client.post('/v1/sessions').json()
        response = client.post('/v1/sessions/' + session['session_id'] + '/chat',
            headers={'X-Session-Token': session['token']}, json={'revision': 0,
                'text': 'tour3 quán quanh Hồ Gươm tối nay120 phút,500nghìn cho2người,thích phở và bún chả,dị ứng đậu phộng'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['assistant']['status'], 'rejected')
        self.assertTrue(response.json()['chat']['allergies'])
        self.assertIsNone(response.json()['tour'])
        self.assertEqual(assistant.calls, [])

    def test_private_record_derived_assistant_history_is_not_sent(self):
        result, assistant = self.result(), AssistantStub('Mình đã ghi nhận.')
        history = [{'role': 'assistant', 'intent': 'ASK_DETAIL', 'text': 'PRIVATE_VENUE_SAMPLE price details'},
                   {'role': 'user', 'intent': 'UPDATE_PROFILE', 'text': 'Đi hai người'},
                   {'role': 'user', 'intent': 'SET_ALLERGY', 'text': 'Tôi dị ứng lạc'}]
        decorate_reply(assistant, result, 'Tiếp tục nhé', history, budget=None, session_cap=6, reserve=3)
        self.assertEqual(assistant.calls[0][1], [history[1]])

    def test_retrieval_is_opt_in_read_only_and_invalid_sources_fail_closed(self):
        found = {'status': 'ok', 'sources': [{'title': 'Synthetic source', 'url': 'https://example.com/food',
            'snippet': 'Synthetic web quotation'}], 'fetched_at': '2026-10-19T00:00:00Z', 'credits': 1, 'cached': False}
        search = SimpleNamespace(search=lambda *args, **kwargs: found)
        assistant = AssistantStub()
        fixture = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.chat.synthetic.json'
        client = TestClient(create_app(data_path=fixture, conversational_assistant=assistant, web_search=search))
        session = client.post('/v1/sessions').json()
        url, headers = '/v1/sessions/' + session['session_id'], {'X-Session-Token': session['token']}
        before = client.get(url, headers=headers).json()
        response = client.post(url + '/chat', headers=headers,
            json={'revision': 0, 'text': 'phở Hà Nội 500k 4 người', 'web_search': True})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['reply']['blocks'][0]['status'], 'ok')
        self.assertEqual(body['preferences'], before['preferences'])
        self.assertEqual(assistant.calls, [])
        found['sources'][0]['url'] = 'https://127.0.0.1/admin'
        response = client.post(url + '/chat', headers=headers,
            json={'revision': 1, 'text': 'phở Hà Nội', 'web_search': True})
        self.assertEqual(response.json()['reply']['blocks'][0]['status'], 'unavailable')
        self.assertEqual(response.json()['reply']['blocks'][0]['sources'], [])
