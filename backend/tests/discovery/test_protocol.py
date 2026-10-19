"""Hermetic protocol/privacy/race tests; no external transport or provider credentials."""
import copy
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import create_app
from app.discovery.engine import handle, model_projection, safe_answer
from app.discovery.gemini import GeminiTools, declarations
from app.discovery.schemas import Profile
from app.discovery.state import State
from app.discovery.tools import Tools
from app.llm.provider import ProviderError
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_discovery import fixture


class Client:
    configured = True
    base_url = 'https://generativelanguage.googleapis.com'
    model = 'existing-model-not-a-live-probe'
    api_key_env = 'NONEXISTENT_DISCOVERY_TEST_KEY'
    last_usage = None
    def __init__(self, response):
        self.response, self.calls = response, []
    def _request(self, url, body, headers, timeout):
        self.calls.append((url, json.loads(body), timeout))
        return json.dumps(self.response).encode()


def response(parts):
    return {'candidates': [{'finishReason': 'STOP', 'content': {'role': 'model', 'parts': parts}}],
            'usageMetadata': {'promptTokenCount': 10, 'secret_untrusted': 'never retained'}}


class ProtocolTests(unittest.TestCase):
    def test_all_native_parameter_references_resolve_at_document_root(self):
        for declaration in declarations():
            root = declaration['parametersJsonSchema']
            def check(value):
                if isinstance(value, dict):
                    if '$ref' in value:
                        self.assertTrue(value['$ref'].startswith('#/'))
                        target = root
                        for key in value['$ref'][2:].split('/'):
                            target = target[key]
                        self.assertIsInstance(target, dict)
                    for child in value.values():
                        check(child)
                elif isinstance(value, list):
                    for child in value:
                        check(child)
            check(root)

    def tools(self):
        return Tools(State(), fixture(), StraightLineEstimator())

    def test_native_schema_and_thought_signature_roundtrip(self):
        parts = [{'thoughtSignature': 'opaque-test-signature', 'functionCall': {
            'id': 'test-call-1', 'name': 'search_restaurants', 'args': {'dish': 'phở'}}}]
        client = Client(response(parts))
        content = GeminiTools(client).generate([{'role': 'user', 'parts': [{'text': 'public food'}]}], deadline_s=3)
        self.assertEqual(content['parts'], parts)
        self.assertEqual(client.calls[0][2], 3)
        self.assertEqual(client.last_usage, {'promptTokenCount': 10})
        self.assertEqual(len(declarations()), 7)
        self.assertTrue(all('parametersJsonSchema' in x for x in declarations()))
        self.assertNotIn('confirm', str(declarations()))

    def test_malformed_unknown_tool_and_oversize_fail_closed_without_retry(self):
        for parts in ([], [{'functionCall': {'name': 'web_search', 'args': {}}}], [{'functionCall': {'name': 'search_restaurants', 'args': []}}]):
            client = Client(response(parts))
            with self.assertRaises(ProviderError):
                GeminiTools(client).generate([], deadline_s=1)
            self.assertEqual(len(client.calls), 1)
        client = Client(response([{'text': 'ok'}]))
        with self.assertRaises(ProviderError):
            GeminiTools(client).generate([{'text': 'x'*13000}], deadline_s=1)
        self.assertEqual(client.calls, [])

    def test_engine_echoes_call_id_signature_and_only_successful_results(self):
        class Model:
            configured = True
            mode = 'mock'
            def __init__(self): self.inputs = []
            def generate(self, contents, **kwargs):
                self.inputs.append(copy.deepcopy(contents))
                if len(self.inputs) == 1:
                    return {'role': 'model', 'parts': [{'thoughtSignature': 'signature', 'functionCall': {
                        'id': 'read-1', 'name': 'search_restaurants', 'args': {'dish': 'phở', 'area': 'Xuân Thủy'}}}]}
                return {'role': 'model', 'parts': [{'text': 'Đã thêm quán vào tour.'}]}
        model, tools = Model(), self.tools()
        result, provider = handle('Tìm phở quanh Xuân Thủy', tools, model=model)
        self.assertEqual(provider['calls'], 2)
        self.assertEqual(model.inputs[1][1]['parts'][0]['thoughtSignature'], 'signature')
        self.assertEqual(model.inputs[1][2]['parts'][0]['functionResponse']['id'], 'read-1')
        self.assertEqual(tools.state.selection, [])
        self.assertNotIn('Đã thêm', result['text'])
        self.assertTrue(tools.state.results)

    def test_sensitive_turns_never_reach_model(self):
        class Bomb:
            configured = True
            mode = 'mock'
            def generate(self, *args, **kwargs): raise AssertionError('private transport')
        for text in ('Tôi bị tiểu đường, tìm chè ít ngọt', 'Tôi đang ở số 123 nhà riêng',
                     'Dị ứng đậu phộng, tìm phở', 'GPS 21.033,105.781', 'Số điện thoại 0987654321'):
            result, provider = handle(text, self.tools(), model=Bomb())
            self.assertTrue(result['text'])
            self.assertEqual(provider['calls'], 0)
            self.assertEqual(provider['reason'], 'private_turn')

    def test_projection_excludes_health_origin_and_record_history(self):
        tools = self.tools()
        tools.state.patch({'origin': {'lat': 21.035, 'lon': 105.783}, 'allergies': ['đậu phộng'], 'exclusions': ['private-health']})
        tools.state.remember('assistant', 'private venue source data')
        encoded = json.dumps(model_projection(tools, 'Chào bạn'), ensure_ascii=False)
        for forbidden in ('21.035', '105.783', 'đậu phộng', 'private-health', 'private venue source data'):
            self.assertNotIn(forbidden, encoded)

    def test_invalid_allergy_term_rejected_before_storage(self):
        with self.assertRaises(ValueError): Profile(allergies=['x'*41])

    def test_long_unicode_conversation_fits_existing_session_storage(self):
        from app.chat.state import ChatState
        from app.repositories.sessions import encode_chat
        state = State()
        for _ in range(40):
            state.remember('user', 'Ẩm thực Hà Nội 🍜 '*100)
            state.remember('assistant', 'Thông tin chưa xác minh 🍲 '*100)
        chat = ChatState()
        chat.discovery = state.dump()
        encoded = encode_chat(chat)
        self.assertLess(len(encoded.encode('utf-8')), 32768)
        self.assertEqual(len(State.restore(chat.discovery).messages), 16)

    def test_upgrade_preserves_legacy_allergies_but_not_assumed_defaults(self):
        from app.repositories.sessions import Session
        from app.chat.state import Allergy, ShortItem
        session = Session(b'test', 9999999999)
        session.chat.set_field('party_size', 2)
        session.chat.set_field('vehicle', 'walk', 'default')
        session.chat.allergies = [Allergy('đậu phộng')]
        session.chat.shortlist = [ShortItem('1')]
        migrated = State.from_session(session)
        self.assertEqual(migrated.profile.allergies, ['đậu phộng'])
        self.assertEqual(migrated.profile.party_size, 2)
        self.assertIsNone(migrated.profile.vehicle)
        self.assertTrue(migrated.tour_stale)
        self.assertEqual(migrated.selection, [{'id': '1', 'locked': False}])
        self.assertIsNone(migrated.confirmation)


class PersistenceTests(unittest.TestCase):
    def test_confirmed_tour_restart_preserves_selection_and_discovery_tastes(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict('os.environ', {
            'FOODTOUR_SESSION_DB': str(Path(temp)/'confirmed.sqlite'), 'FOODTOUR_LLM': 'mock',
            'GEMINI_API_KEY': '', 'FOODTOUR_EXPLAIN': 'template'}):
            path = Path(__file__).resolve().parents[4]/'contracts/fixtures/venues.chat.synthetic.json'
            with TestClient(create_app(data_path=path)) as client:
                session = client.post('/v1/sessions', json={}).json()
                url, headers = f"/v1/sessions/{session['session_id']}/assistant", {'X-Session-Token': session['token']}
                def post(payload):
                    rev = client.get(url, headers=headers).json()['revision']
                    response = client.post(url, headers=headers, json={'revision': rev, **payload})
                    self.assertEqual(response.status_code, 200, response.text)
                    return response.json()
                found = post({'text': 'Tìm quán quanh Hồ Gươm'})
                selected_id = found['results'][0]['id']
                post({'action': {'type': 'tool', 'name': 'update_foodtour_selection', 'arguments': {
                    'operation': 'add', 'venue_ids': [selected_id], 'selection_version': 0}}})
                post({'text': 'Tìm chè ít ngọt'})
                post({'text': 'Xuất phát từ Hồ Gươm lúc 18h, tổng 120 phút, đi bộ, 2 người'})
                ready = post({'action': {'type': 'tool', 'name': 'create_itinerary', 'arguments': {}}})
                confirmed = post({'action': {'type': 'confirm', 'confirmation_id': ready['confirmation']['id']}})
            with TestClient(create_app(data_path=path)) as restarted:
                response = restarted.get(url, headers=headers)
                self.assertEqual(response.status_code, 200, response.text)
                restored = response.json()
                self.assertEqual(restored['tour'], confirmed['tour'])
                self.assertEqual(restored['selection'][0]['id'], selected_id)
                self.assertIn('ít ngọt', restored['profile']['tastes'])
                self.assertIsNone(restored['confirmation'])

    def test_sqlite_restart_keeps_versions_selection_messages_and_nonce(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict('os.environ', {
            'FOODTOUR_SESSION_DB': str(Path(temp)/'sessions.sqlite'), 'FOODTOUR_LLM': 'mock',
            'GEMINI_API_KEY': '', 'FOODTOUR_EXPLAIN': 'template', 'FOODTOUR_CHAT_V2': '1'}):
            path = Path(__file__).resolve().parents[4]/'contracts/fixtures/venues.chat.synthetic.json'
            app = create_app(data_path=path)
            with TestClient(app) as client:
                session = client.post('/v1/sessions', json={}).json()
                url = f"/v1/sessions/{session['session_id']}/assistant"
                headers = {'X-Session-Token': session['token']}
                found = client.post(url, headers=headers, json={'revision': 0, 'text': 'Tìm phở quanh Hồ Gươm'}).json()
                selected = client.post(url, headers=headers, json={'revision': 1, 'action': {'type': 'tool',
                    'name': 'update_foodtour_selection', 'arguments': {'operation': 'add',
                    'venue_ids': [found['results'][0]['id']], 'selection_version': 0}}}).json()
            with TestClient(create_app(data_path=path)) as restarted:
                restored = restarted.get(url, headers=headers).json()
                self.assertEqual(restored['selection'], selected['selection'])
                self.assertEqual(restored['selection_version'], 1)
                self.assertEqual(restored['messages'], selected['messages'])
                self.assertEqual(restored['revision'], 2)
                self.assertEqual(restored['profile'], selected['profile'])

    def test_concurrent_turns_compare_and_swap_once_and_model_transport_not_locked(self):
        path = Path(__file__).resolve().parents[4]/'contracts/fixtures/venues.chat.synthetic.json'
        with patch.dict('os.environ', {'FOODTOUR_SESSION_DB': '', 'FOODTOUR_LLM': 'mock', 'GEMINI_API_KEY': '', 'FOODTOUR_EXPLAIN': 'template'}):
            app = create_app(data_path=path)
            barrier = threading.Barrier(2)
            class Model:
                configured = True
                mode = 'mock'
                def generate(self, *args, **kwargs):
                    barrier.wait(timeout=3)
                    return {'role': 'model', 'parts': [{'text': 'Chào bạn.'}]}
            app.state.discovery_model = Model()
            with TestClient(app) as client:
                s = client.post('/v1/sessions', json={}).json()
                url, headers = f"/v1/sessions/{s['session_id']}/assistant", {'X-Session-Token': s['token']}
                def turn(): return client.post(url, headers=headers, json={'revision': 0, 'text': 'Chào bạn'}).status_code
                with ThreadPoolExecutor(2) as pool:
                    statuses = list(pool.map(lambda _: turn(), range(2)))
                self.assertEqual(sorted(statuses), [200, 409])
                body = client.get(url, headers=headers).json()
                self.assertEqual(body['revision'], 1)
                self.assertEqual(len(body['messages']), 2)
                self.assertEqual(body['provider']['mode'], 'mock')
