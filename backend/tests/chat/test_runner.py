"""Exercise acceptance failures even before the real endpoint lands."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from qa.chat.run_scenarios import evaluate, StubUnderstandingProvider, EXPECT_KEYS, run_scenario
from qa.chat.eval_utterances import evaluate as eval_intents


class RunnerChecks(unittest.TestCase):
    def setUp(self):
        self.body = {'revision': 1, 'tour': None, 'llm_calls': 0, 'turn': {'intent': 'SEARCH_VENUES', 'understanding': 'rules'},
                     'chat': {'phase': 'choose', 'pending': None, 'last_results': [{'label': 'A', 'venue_id': 's1'}],
                              'profile': {'party_size': {'value': 3}}, 'allergies': []},
                     'reply': {'blocks': [{'type': 'text', 'text': 'Chưa rõ'}, {'type': 'venue_cards', 'cards': [
                         {'venue': {'id': 's1', 'name': 'Synthetic', 'district': 'Hoàn Kiếm', 'address': None,
                                    'price': None, 'hours': None, 'rating': None}, 'flags': [{'code': 'hours_unknown'}],
                          'distance_m': None, 'distance_source': 'unknown'}]}]}}
        self.fixture = {'s1': {'name': 'Synthetic', 'district': 'Hoàn Kiếm', 'address': None}}

    def check_body(self, expect, body=None, **kwargs):
        return evaluate(body or self.body, expect, fixture=self.fixture, **kwargs)

    def test_all_corpus_expectations_are_known(self):
        for path in (ROOT / 'qa/chat/scenarios').glob('*.json'):
            for scenario in json.loads(path.read_text(encoding='utf-8'))['scenarios']:
                for turn in scenario['turns']:
                    self.assertFalse(set(turn['expect']) - EXPECT_KEYS)

    def test_parallel_expectations_and_accent_folding(self):
        self.assertEqual(self.check_body({'intent': 'SEARCH_VENUES', 'understanding': 'rules', 'tour': 'none',
            'phase': 'choose', 'pending_kind': None, 'llm_calls_max': 0, 'blocks_include': ['venue_cards'],
            'blocks_exclude': ['tour_ready'], 'text_contains': ['chua ro'], 'text_not_contains': ['đã xác minh'],
            'state': {'profile.party_size.value': 3}, 'state_absent': ['pending', 'shortlist.0'],
            'cards': {'min': 1, 'max': 1}, 'card_flags_all': ['hours_unknown'], 'label_refs': ['A'],
            'no_card_name_contains': ['cua']}), [])

    def test_each_expectation_can_fail(self):
        cases = [{'intent': 'ADD'}, {'understanding': 'llm'}, {'tour': 'present'}, {'phase': 'planned'},
                 {'pending_kind': 'confirm_plan'}, {'blocks_include': ['notice']}, {'blocks_exclude': ['venue_cards']},
                 {'text_contains': ['missing']}, {'text_not_contains': ['chua ro']},
                 {'state': {'profile.party_size.value': 4}}, {'state_absent': ['profile.party_size.value']},
                 {'cards': {'min': 2}}, {'cards': {'max': 0}}, {'card_flags_all': ['allergy_unknown']},
                 {'no_card_name_contains': ['synthetic']}, {'label_refs': ['B']}, {'compare': {'criteria': ['distance']}},
                 {'typo': True}, {'status': 409}, {'error_code': 'conflict'}]
        for expect in cases:
            with self.subTest(expect=expect):
                self.assertTrue(self.check_body(expect))

    def test_global_tour_provider_and_unknown_fact_invariants(self):
        mutations = [lambda b: b.update(tour={'stops': []}), lambda b: b.update(llm_calls=2),
                     lambda b: b['reply']['blocks'][1]['cards'][0]['venue'].update(name='Invented'),
                     lambda b: b['reply']['blocks'][1]['cards'][0]['venue'].update(price={'min_vnd': 42, 'max_vnd': 43, 'semantics': 'per_person'}),
                     lambda b: b['reply']['blocks'][1]['cards'][0].update(why=[{'text': 'an toàn cho dị ứng'}]),
                     lambda b: b['reply']['blocks'][1]['cards'][0].update(distance_m=123),
                     lambda b: b['chat'].update(allergies=[{'term': 'cua'}])]
        for mutate in mutations:
            body = deepcopy(self.body)
            mutate(body)
            self.assertTrue(self.check_body({}, body))
        self.assertTrue(self.check_body({}, actual_calls=2))
        self.assertTrue(self.check_body({'llm_calls_max': 0}, status=409, actual_calls=1))

    def test_compare_rows_unknowns_and_unsupported(self):
        self.body['reply']['blocks'].append({'type': 'compare_table', 'criteria': [{'id': 'distance'}],
            'rows': [{'criterion_id': 'distance', 'cells': [{'value': None, 'status': 'unknown'}]}],
            'unsupported': [{'criterion': 'quiet'}]})
        expect = {'compare': {'criteria': ['distance'], 'unsupported': ['quiet'], 'status': {'distance': 'unknown'}}}
        self.assertEqual(self.check_body(expect), [])
        self.body['reply']['blocks'][-1]['rows'][0]['cells'][0]['value'] = '100 m'
        self.assertTrue(self.check_body(expect))

    def test_repeat_question_slot_value_changes(self):
        self.body['chat']['pending'] = {'kind': 'clarify_slot', 'slot': 'area'}
        self.body['chat']['profile']['area'] = {'value': None}
        self.body['reply']['blocks'].append({'type': 'clarify', 'question': 'Ở đâu?'})
        history = []
        self.assertEqual(self.check_body({'no_repeat_of_previous_question': True}, history=history), [])
        self.assertTrue(self.check_body({'no_repeat_of_previous_question': True}, history=history))
        self.body['chat']['profile']['area']['value'] = {'district': 'Cầu Giấy'}
        self.assertEqual(self.check_body({'no_repeat_of_previous_question': True}, history=history), [])

    def test_stub_exact_lookup_is_detached_and_counted(self):
        provider = StubUnderstandingProvider({'x': {'intent': 'ADD', 'patch': {}}})
        provider.understand('x', None)['patch']['bad'] = True
        self.assertEqual(provider('x', None)['patch'], {})
        with self.assertRaises(AssertionError):
            provider('missing', None)
        self.assertEqual(provider.calls, 3)

    def test_intent_evaluator_denominator_and_confusion(self):
        report = eval_intents(lambda text, state: {'intent': 'ADD'}, ROOT / 'qa/chat/utterances.jsonl')
        self.assertEqual(report['total'], 165)
        self.assertEqual(report['correct'], report['confusion']['ADD']['ADD'])
        self.assertLess(report['accuracy'], 1)

    def test_runner_replays_exact_revision_and_compares_only_persisted_state(self):
        def response(body, status=200):
            return SimpleNamespace(status_code=status, json=lambda: deepcopy(body), raise_for_status=lambda: None)
        initial = {'revision': 0, 'chat': {}, 'tour': None, 'preferences': {}}
        view = deepcopy(self.body)
        view['preferences'] = {}
        persisted = {k: view[k] for k in ('revision', 'chat', 'tour', 'preferences')}
        client = MagicMock()
        client.get.side_effect = [response(initial), response({'features': {'chat_v2': True}}),
                                  response(persisted), response(persisted)]
        client.post.side_effect = [response({'session_id': 'fake', 'token': 'fake'}), response({}, 422),
                                   response(view), response({'error': {'code': 'revision_conflict'}}, 409)]
        app = SimpleNamespace(state=SimpleNamespace(venues=SimpleNamespace(snapshot=lambda: SimpleNamespace(
            venues=[SimpleNamespace(id='s1', **self.fixture['s1'])]))))
        scenario = {'id': 'replay', 'turns': [{'say': 'search', 'expect': {'tour': 'none'}},
                    {'repeat_request': 1, 'expect': {'status': 409, 'error_code': 'revision_conflict'}}]}
        with patch('qa.chat.run_scenarios.scenario_app', return_value=nullcontext((app, client, StubUnderstandingProvider({})))):
            report = run_scenario(scenario)
        self.assertEqual(report['status'], 'passed', report)
        calls = client.post.call_args_list
        self.assertEqual(calls[-1].kwargs['json'], calls[-2].kwargs['json'])
        self.assertEqual(calls[-1].kwargs['json']['revision'], 0)


    def test_phrase_boundaries_do_not_confuse_food_with_celsius(self):
        self.body['reply']['blocks']=[{'type':'text','text':'đồ chiên'}]
        self.assertEqual(self.check_body({'text_not_contains':['độ C']}),[])
        self.body['reply']['blocks']=[{'type':'text','text':'35 độ C'}]
        self.assertTrue(self.check_body({'text_not_contains':['độ C']}))
