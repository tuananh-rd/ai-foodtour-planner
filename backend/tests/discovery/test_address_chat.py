"""Offline address/privacy and model-led conversation regressions."""
import json
import unittest
from app.providers.reverse_address import ReverseAddress
from app.discovery.schemas import LocationInput
from app.discovery.experience import location_action
from app.discovery.engine import handle, model_projection, references
from app.discovery.state import State
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_discovery import fixture


def response(house=None):
    props = {'street': 'Phố giả lập', 'city': 'Hà Nội'}
    if house: props['housenumber'] = house
    return {'features': [{'geometry': {'coordinates': [105.8522, 21.0285]}, 'properties': props}]}


class AddressChatTests(unittest.TestCase):
    def tools(self):
        return Tools(State(), fixture(), StraightLineEstimator())

    def test_reverse_click_cache_rate_timeout_and_no_invented_number(self):
        calls = []
        clock = [100.0]
        service = ReverseAddress(transport=lambda lat, lon: calls.append((lat, lon)) or response(), clock=lambda: clock[0])
        first = service.resolve(21.0285, 105.8522)
        self.assertEqual(first['label'], 'Phố giả lập, Hà Nội')
        self.assertTrue(first['approximate'])
        self.assertEqual(service.resolve(21.0285, 105.8522), first)
        self.assertEqual(len(calls), 1)
        self.assertEqual(service.resolve(21.029, 105.85)['address_reason'], 'rate_limited')
        clock[0] += 2
        service.transport = lambda *_: (_ for _ in ()).throw(TimeoutError())
        self.assertEqual(service.resolve(21.029, 105.85)['address_status'], 'unavailable')
        clock[0] += 2
        service.transport = lambda *_: response('12')
        self.assertFalse(service.resolve(21.0286, 105.8522)['label'].startswith('12'))

    def test_far_malformed_disabled_and_bounded_cache(self):
        service = ReverseAddress(enabled=False)
        self.assertEqual(service.resolve(21.0, 105.8)['address_reason'], 'disabled')
        service = ReverseAddress(transport=lambda *_: {'features': [{'geometry': {'coordinates': [0, 0]}}]})
        self.assertEqual(service.resolve(21.0285, 105.8522)['address_status'], 'unavailable')
        self.assertEqual(service.resolve(float('nan'), 105.8)['address_reason'], 'invalid_coordinates')

    def test_explicit_gps_only_and_manual_label_keeps_coordinates(self):
        calls = []
        service = ReverseAddress(transport=lambda *_: calls.append(1) or response())
        tools = self.tools()
        args = {'operation': 'coordinates', 'lat': 21.0285, 'lon': 105.8522, 'source': 'gps'}
        location_action(tools.state, tools, args, service)
        self.assertEqual(calls, [])
        location_action(tools.state, tools, {**args, 'resolve_address': True}, service)
        self.assertEqual(calls, [1])
        self.assertEqual(tools.state.location['address_status'], 'resolved')
        old = tools.state.profile.origin.model_copy()
        location_action(tools.state, tools, {'operation': 'label', 'label': 'Cổng khách sạn đã chọn'}, service)
        self.assertEqual(old, tools.state.profile.origin)
        self.assertEqual(tools.state.location['address_status'], 'manual')
        projected = json.dumps(model_projection(tools, 'Xin tư vấn món ăn'), ensure_ascii=False)
        self.assertNotIn('105.8522', projected)
        self.assertNotIn('Cổng khách sạn', projected)
        with self.assertRaises(ValueError):
            LocationInput.model_validate({**args, 'source': 'coordinates', 'resolve_address': True})

    def test_model_general_advice_one_question_survives_without_onboarding(self):
        class Model:
            configured = True
            mode = 'gemini'
            def generate(self, contents, *, deadline_s):
                return {'role': 'model', 'parts': [{'text': 'Phở là lựa chọn món nước dễ ăn. Bạn thích nước dùng thanh hay đậm?'}]}
        tools = self.tools()
        reply, provider = handle('Tư vấn một món nước dễ ăn', tools, model=Model())
        self.assertIn('nước dùng thanh', reply['text'])
        self.assertEqual(provider['reply_source'], 'model')
        self.assertIsNone(tools.state.profile.origin)
        result, provenance = handle('Chào bạn, mình mới tìm hiểu ẩm thực Hà Nội.', self.tools(), model=Model())
        self.assertEqual(provenance['reply_source'], 'model')
        self.assertNotIn('cần vị trí', result['text'])
        tools = self.tools()
        tools.state.patch({'foods': ['chè']})
        handle('Bún chả khác bún đậu thế nào?', tools, model=Model())
        self.assertEqual(tools.state.profile.foods, ['chè'])

    def test_sqlite_reservation_survives_without_revision_and_caps_model_calls(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from app.main import create_app
        class Model:
            configured = True
            mode = 'mock'
            calls = 0
            def generate(self, *args, **kwargs):
                self.calls += 1
                return {'role': 'model', 'parts': [{'text': 'Chào bạn.'}]}
        with tempfile.TemporaryDirectory() as tmp, patch.dict('os.environ', {
                'FOODTOUR_SESSION_DB': str(Path(tmp)/'sessions.sqlite'), 'FOODTOUR_LLM': 'mock',
                'FOODTOUR_LLM_SESSION_CAP': '2', 'GEMINI_API_KEY': '', 'FOODTOUR_EXPLAIN': 'template'}):
            app = create_app(data_path=Path(__file__).resolve().parents[4]/'contracts/fixtures/venues.chat.synthetic.json')
            model = Model()
            app.state.discovery_model = model
            with TestClient(app) as client:
                session = client.post('/v1/sessions', json={}).json()
                route = '/v1/sessions/'+session['session_id']+'/assistant'
                headers = {'X-Session-Token': session['token']}
                first = client.post(route, headers=headers, json={'revision': 0, 'text': 'Chào bạn'}).json()
                second = client.post(route, headers=headers, json={'revision': first['revision'], 'text': 'Xin chào'}).json()
                third = client.post(route, headers=headers, json={'revision': second['revision'], 'text': 'Chào lại'}).json()
                self.assertEqual(model.calls, 2)
                self.assertEqual(third['provider']['calls'], 0)
                self.assertEqual(third['settings']['remaining_session_calls'], 0)
                self.assertIn('quota', third['provider']['reason'])

    def test_two_model_questions_rejected_and_ordinal_reference_bound(self):
        from app.discovery.engine import safe_answer
        tools = self.tools()
        self.assertIsNone(safe_answer('Bạn ăn gì? Ở đâu?', tools, []))
        tools.state.results = list(tools.by_id)[:3]
        self.assertEqual(references('Chọn quán đầu tiên', tools), tools.state.results[:1])
        tools.state.public_dialogue = [{'role': 'assistant', 'text': 'Bạn thích món nước hay món khô?'}]
        self.assertEqual(model_projection(tools, 'món nước')['recent_general_dialogue'], tools.state.public_dialogue)
        tools.state.comparison, tools.state.results = tools.state.results[:2], []
        self.assertEqual(references('Chọn A và B', tools), tools.state.comparison)


if __name__ == '__main__': unittest.main()
