"""New journey/safety contracts. Synthetic fixtures and hermetic models only; never live evidence."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import create_app
from app.data.loader import Dataset
from app.planner.types import Venue
from app.planner.interfaces import StraightLineEstimator
from app.discovery.state import State
from app.discovery.tools import Tools
from app.discovery.engine import handle
from app.discovery.schemas import Turn


def fixture():
    return Dataset(tuple(Venue(str(i), f'[SYNTHETIC] {name}', 21.035 + i*.0001, 105.783 + i*.0001,
        address=f'{i} Xuân Thủy, Cầu Giấy', district='Cầu Giấy', dish_tags=(dish,),
        synthetic=True, price_min_vnd=30000, price_max_vnd=80000, hours_display='07:00–22:00')
        for i, name, dish in [(1, 'Phở A', 'phở'), (2, 'Phở B', 'phở'), (3, 'Chè C', 'chè')]),
        'synthetic-v1', 'synthetic', 3, {}, {})


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.state = State()
        self.tools = Tools(self.state, fixture(), StraightLineEstimator())

    def say(self, text):
        self.tools = Tools(self.state, fixture(), StraightLineEstimator())  # each HTTP turn gets its own tool budget
        return handle(text, self.tools)[0]

    def choose(self, ids):
        return self.tools.run('update_foodtour_selection', {'operation': 'add', 'venue_ids': ids,
                      'selection_version': self.state.selection_version})

    def prepare(self):
        self.tools.run('search_restaurants', {'dish': 'phở'})
        self.choose(['1', '2'])
        self.tools.run('update_preferences', {'patch': {'area': 'Xuân Thủy', 'origin': {'lat': 21.035, 'lon': 105.783},
            'start_time': '16:00', 'duration_min': 120, 'vehicle': 'walk', 'party_size': 2,
            'budget_vnd': 500000, 'budget_scope': 'group'}})
        return self.tools.run('create_itinerary', {})

    def test_greeting_is_not_a_form(self):
        r = self.say('Chào bạn')
        self.assertEqual(r['status'], 'ok')
        self.assertIsNone(r['question'])
        self.assertIsNone(self.state.profile.party_size)
        self.assertIsNone(self.state.confirmation)

    def test_followup_area_resumes_search_without_trip_questions(self):
        first = self.say('Tìm phở dưới 70k')
        self.assertIn('khu vực', first['question'])
        second = self.say('Xuân Thủy')
        self.assertEqual(len(self.state.results), 2)
        self.assertIsNone(second['question'])
        self.assertIn('chưa chứng minh giá món', second['text'])
        self.assertIsNone(self.state.pending_search)
        self.assertIsNone(self.state.profile.duration_min)

    def test_short_answers_only_fill_the_one_contextual_question(self):
        self.say('2')
        self.assertIsNone(self.state.profile.party_size)
        self.say('Tìm phở quanh Xuân Thủy')
        self.say('Thêm A')
        self.say('Tạo lịch trình')
        self.assertEqual(self.state.pending_slot, 'origin')
        self.say('Xuân Thủy')
        self.assertIsNotNone(self.state.profile.origin)
        self.assertEqual(self.state.pending_slot, 'start_time')
        self.say('18')
        self.assertEqual(self.state.profile.start_time, '18:00')
        self.assertEqual(self.state.pending_slot, 'duration_min')
        self.say('120')
        self.say('đi bộ')
        self.assertEqual(self.state.pending_slot, 'party_size')
        self.say('2')
        self.assertEqual(self.state.profile.party_size, 2)
        self.assertIsNotNone(self.state.confirmation)
        self.assertIsNone(self.tools.planned_tour)

    def test_xuan_thuy_under70k_is_discovery_not_trip_budget(self):
        r = self.say('Quanh Xuân Thủy có quán phở nào dưới 70k không?')
        self.assertEqual(len(self.state.results), 2)
        self.assertIsNone(self.state.profile.budget_vnd)
        self.assertIsNone(r['question'])
        self.assertIn('chưa chứng minh giá món', r['text'])
        self.assertIsNone(self.tools.planned_tour)

    def test_compare_add_then_che_retains_preference_and_selection(self):
        self.say('Tìm phở quanh Xuân Thủy')
        expected = list(self.state.results)
        r = self.say('So sánh A với B, tôi đi cùng bố mẹ')
        self.assertEqual(self.state.comparison, expected)
        self.assertIn('chưa rõ', r['text'])
        r = self.say('Thêm A, rồi tìm chè ít ngọt')
        self.assertEqual(self.state.selection, [{'id': expected[0], 'locked': False}])
        self.assertEqual(self.state.results, ['3'])
        self.assertIn('ít ngọt', self.state.profile.tastes)
        self.assertIn('chưa chứng minh', r['text'])

    def test_group_money_and_per_leg_are_independent(self):
        self.say('500k cho 2 người, 20 phút mỗi chặng')
        p = self.state.profile
        self.assertEqual((p.budget_vnd, p.party_size, p.budget_scope), (500000, 2, 'group'))
        self.assertEqual(p.max_leg_min, 20)
        self.assertIsNone(p.duration_min)
        self.say('Đổi ngân sách thành 600 nghìn cả nhóm')
        self.assertEqual(self.state.profile.budget_vnd, 600000)
        self.assertEqual(self.state.profile.party_size, 2)
        self.assertEqual(self.state.profile.max_leg_min, 20)

    def test_ids_versions_and_locks_are_atomic(self):
        self.tools.run('search_restaurants', {'dish': 'phở'})
        before = copy.deepcopy(self.state.selection)
        self.assertEqual(self.choose(['missing'])['status'], 'tool_error')
        self.assertEqual(self.state.selection, before)
        self.choose(['1'])
        stale = self.tools.run('update_foodtour_selection', {'operation': 'add', 'venue_ids': ['2'], 'selection_version': 0})
        self.assertEqual(stale['status'], 'tool_error')
        self.tools.run('update_foodtour_selection', {'operation': 'lock', 'venue_ids': ['1'], 'selection_version': 1})
        self.assertEqual(self.tools.run('update_foodtour_selection', {'operation': 'remove', 'venue_ids': ['1'], 'selection_version': 2})['status'], 'tool_error')

    def test_confirmation_explicit_and_invalidated_by_patch(self):
        self.prepare()
        c = copy.deepcopy(self.state.confirmation)
        self.say('ok')
        self.assertIsNone(self.tools.planned_tour)
        self.tools.run('update_preferences', {'patch': {'party_size': 3}})
        self.assertIsNone(self.state.confirmation)
        self.assertEqual(self.tools.confirm(c['id'])['status'], 'tool_error')

    def test_plan_only_after_current_confirmation(self):
        self.prepare()
        self.assertIsNone(self.tools.planned_tour)
        r = self.tools.confirm(self.state.confirmation['id'])
        self.assertEqual(r['status'], 'ok')
        self.assertEqual(len(self.tools.planned_tour.stops), 2)

    def test_allergy_unknown_strict_does_not_plan(self):
        self.prepare()
        self.say('Tôi dị ứng đậu phộng')
        r = self.tools.run('create_itinerary', {})
        self.assertEqual(r['status'], 'unknown')
        self.assertIsNone(self.state.confirmation)
        self.assertIsNone(self.tools.planned_tour)
        self.assertIn('chưa cho phép', r['text'])

    def test_unknown_area_not_global_no_results_or_weather_block(self):
        r = self.say('Tìm phở quanh nơi không có trong dữ liệu')
        self.assertEqual(r['status'], 'unknown')
        self.assertEqual(self.state.results, [])
        r = self.say('Thời tiết hôm nay thế nào')
        self.assertIn('chưa có dữ liệu thời tiết', r['text'])
        self.assertIsNone(r['question'])

    def test_state_roundtrip_no_migration_or_dataset_copy(self):
        self.prepare()
        raw = self.state.dump()
        restored = State.restore(json.loads(json.dumps(raw)))
        self.assertEqual(restored.dump(), raw)
        self.assertNotIn('source_url', json.dumps(raw))

    def test_timeout_no_silence_and_call_cap(self):
        class Failing:
            configured = True
            mode = 'mock'
            def generate(self, *args, **kwargs):
                raise TimeoutError()
        r, p = handle('Xin chào', self.tools, model=Failing())
        self.assertEqual(r['status'], 'ok')
        self.assertTrue(r['text'])
        self.assertEqual(p['calls'], 1)
        self.assertEqual(p['mode'], 'rules')
        self.assertEqual(p['reason'], 'timeout_rules_fallback')

    def test_exhausted_model_session_still_allows_local_discovery_without_calls(self):
        class Bomb:
            configured = True
            mode = 'mock'
            def generate(self, *args, **kwargs):
                raise AssertionError('Exhausted session must not call provider')
        result, provider = handle('Tìm phở quanh Xuân Thủy', self.tools, model=Bomb(), llm_used=6, session_cap=6)
        self.assertTrue(self.state.results)
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(provider['calls'], 0)
        self.assertEqual(provider['reason'], 'quota_rules_fallback')
        self.assertIn('xử lý tại máy', result['text'])

    def test_model_cannot_add_or_confirm_without_user_authority(self):
        self.tools.run('search_restaurants', {'dish': 'phở'})
        class Attack:
            configured = True
            mode = 'mock'
            def generate(self, *args, **kwargs):
                return {'role': 'model', 'parts': [{'functionCall': {'name': 'update_foodtour_selection',
                    'args': {'operation': 'add', 'venue_ids': ['1'], 'selection_version': 0}}}]}
        r, p = handle('Chào bạn', self.tools, model=Attack())
        self.assertEqual(r['status'], 'tool_error')
        self.assertEqual(self.state.selection, [])
        self.assertEqual(p['calls'], 2)

    def test_new_turn_rejects_extra_fields(self):
        with self.assertRaises(ValueError):
            Turn.model_validate({'revision': 0, 'text': 'phở', 'web_search': True})


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict('os.environ', {'FOODTOUR_LLM': 'mock', 'FOODTOUR_EXPLAIN': 'template',
             'FOODTOUR_SESSION_DB': '', 'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_TAVILY_ENABLED': '0', 'GEMINI_API_KEY': '', 'TAVILY_API_KEY': ''})
        self.env.start()
        data = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.chat.synthetic.json'
        # Repository root sits one level above backend/.
        data = Path(__file__).resolve().parents[4] / 'contracts/fixtures/venues.chat.synthetic.json'
        self.app = create_app(data_path=data)
        self.client = TestClient(self.app)
        self.session = self.client.post('/v1/sessions', json={}).json()
        self.url = f"/v1/sessions/{self.session['session_id']}/assistant"
        self.headers = {'X-Session-Token': self.session['token']}

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def test_auth_revision_shape_and_greeting(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        r = self.client.post(self.url, headers=self.headers, json={'revision': 0, 'text': 'Chào bạn'})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body['contract'], 'discovery-v1')
        self.assertEqual(body['provider']['calls'], 0)
        self.assertIsNone(body['reply']['question'])
        self.assertEqual(self.client.post(self.url, headers=self.headers, json={'revision': 0, 'text': 'ok'}).status_code, 409)
        restored = self.client.get(self.url, headers=self.headers).json()
        self.assertEqual(restored['revision'], 1)
        self.assertEqual(len(restored['messages']), 2)

    def test_http_confirm_renders_real_planner_with_discovery_tastes(self):
        def post(payload):
            current = self.client.get(self.url, headers=self.headers).json()
            response = self.client.post(self.url, headers=self.headers, json={'revision': current['revision'], **payload})
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()
        found = post({'text': 'Tìm quán quanh Hồ Gươm'})
        post({'action': {'type': 'tool', 'name': 'update_foodtour_selection', 'arguments': {
            'operation': 'add', 'venue_ids': [found['results'][0]['id']], 'selection_version': 0}}})
        post({'text': 'Tìm chè ít ngọt'})
        post({'text': '600 nghìn cả nhóm cho 2 người, 20 phút mỗi chặng'})
        post({'text': 'Xuất phát từ Hồ Gươm lúc 18h, tổng 120 phút, đi bộ'})
        prepared = post({'action': {'type': 'tool', 'name': 'create_itinerary', 'arguments': {}}})
        confirmed = post({'action': {'type': 'confirm', 'confirmation_id': prepared['confirmation']['id']}})
        self.assertTrue(confirmed['tour']['stops'])
        restored = self.client.get(self.url, headers=self.headers)
        self.assertEqual(restored.status_code, 200, restored.text)

    def test_no_web_contract_and_no_auto_plan(self):
        r = self.client.post(self.url, headers=self.headers, json={'revision': 0, 'text': 'phở', 'web_search': True})
        self.assertEqual(r.status_code, 422)
        r = self.client.post(self.url, headers=self.headers, json={'revision': 0, 'text': 'Tìm phở quanh Hồ Gươm'})
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertTrue(b['results'])
        self.assertIsNone(b['tour'])
        self.assertIsNone(b['confirmation'])
        self.assertIsNone(b['profile']['party_size'])

    def test_retired_web_is_rejected_even_on_legacy_chat_and_factory_never_runs_it(self):
        class Bomb:
            configured = True
            def search(self, *args, **kwargs):
                raise AssertionError('retired provider called')
        self.app.state.web_search = Bomb()  # legacy injection still cannot expose a request path
        legacy = self.url.replace('/assistant', '/chat')
        r = self.client.post(legacy, headers=self.headers, json={'revision': 0, 'text': 'phở', 'web_search': True})
        self.assertEqual(r.status_code, 422)
        self.assertNotIn('web_search', self.app.openapi()['components']['schemas']['ChatRequest']['properties'])


if __name__ == '__main__':
    unittest.main()
