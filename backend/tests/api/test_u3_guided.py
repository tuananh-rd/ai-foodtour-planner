"""U3 API boundaries; all data synthetic and all providers local stubs."""
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import create_app
from app.chat.state import Allergy, Pending, ShortItem
from app.repositories.llm_budget import DailyLLMBudget
from tests.api.record_u3_golden import record

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT/'contracts/fixtures/venues.chat.synthetic.json'
CUE = 'Tour 3 quán quanh Hồ Gươm tối nay, mình bị dị ứng nhẹ với mấy thứ rang giòn'


class GuidedAPI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = str(Path(self.tmp.name)/'sessions.sqlite')
        self.env = patch.dict(os.environ, {'FOODTOUR_CHAT_V2': '1', 'FOODTOUR_UI_GUIDED': '1',
            'FOODTOUR_LLM': 'off', 'FOODTOUR_EXPLAIN': 'template', 'FOODTOUR_GEOCODER': 'off',
            'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_SESSION_DB': self.db,
            'FOODTOUR_RATE_LIMIT_TOKEN': '10000', 'FOODTOUR_RATE_LIMIT_IP': '10000'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.restart()
        s = self.client.post('/v1/sessions').json()
        self.sid, self.token, self.rev = s['session_id'], s['token'], 0
        self.url = '/v1/sessions/'+self.sid
        self.headers = {'X-Session-Token': self.token}

    def restart(self):
        self.app = create_app(data_path=FIXTURE)
        self.client = TestClient(self.app, raise_server_exceptions=False)

    def post(self, **body):
        r = self.client.post(self.url+'/chat', headers=self.headers, json={'revision': self.rev, **body})
        self.assertEqual(r.status_code, 200, r.text)
        self.rev = r.json()['revision']
        return r.json()

    def act(self, kind, **args):
        return self.post(action={'type': kind, **args})

    def test_confirmed_short_visit_tour_survives_durable_reload(self):
        self.post(text='Tôi muốn ăn tour 3 quán quanh Hồ Gươm vào tối nay 120 phút, ngân sách 500 nghìn cho 2 người. Tôi thích phở và bún chả, dị ứng đậu phộng.')
        self.act('pick_option', option_id='scope:group')
        proposed = self.post(text='19h')
        self.assertEqual(proposed['chat']['pending']['kind'], 'confirm_plan')
        planned = self.act('confirm_yes')
        self.assertEqual(len(planned['tour']['stops']), 3)
        self.restart()
        response = self.client.get(self.url, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        restored = response.json()['tour']
        self.assertIsNotNone(restored, 'Confirmed tour must retain its agreed visit duration after SQLite reload')
        self.assertEqual(restored['stops'], planned['tour']['stops'])
        self.assertEqual(restored['assumptions'], planned['tour']['assumptions'])
        old_ids = [stop['venue_id'] for stop in restored['stops']]
        replacement = self.client.post(self.url+'/tour/replace', headers=self.headers,
            json={'base_revision': planned['revision'], 'venue_id': old_ids[1]})
        self.assertEqual(replacement.status_code, 200, replacement.text)
        changed = replacement.json()['tour']
        new_ids = [stop['venue_id'] for stop in changed['stops']]
        self.assertEqual(new_ids[::2], old_ids[::2])
        self.assertNotIn(old_ids[1], new_ids)
        self.assertEqual(changed['assumptions'], restored['assumptions'])
        self.restart()
        self.assertEqual(self.client.get(self.url, headers=self.headers).json()['tour']['stops'], changed['stops'])
        with closing(sqlite3.connect(self.db)) as db:
            record = json.loads(db.execute('SELECT tour FROM sessions WHERE id=?', (self.sid,)).fetchone()[0])
        for invalid in (True, 19, 46, '30'):
            with self.subTest(invalid=invalid):
                corrupted = {**record, 'visit_minutes': invalid}
                with closing(sqlite3.connect(self.db)) as db, db:
                    db.execute('UPDATE sessions SET tour=? WHERE id=?', (json.dumps(corrupted), self.sid))
                self.assertEqual(self.client.get(self.url, headers=self.headers).status_code, 503)

    def seed(self, pending='allergy_term', unresolved=True):
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            st = s.chat
            st.set_field('area', {'kind': 'district', 'label': 'Hoàn Kiếm', 'lat': 21.0285,
                                  'lon': 105.8522, 'district': 'Hoàn Kiếm'})
            st.set_field('duration_min', 180)
            st.set_field('vehicle', 'walk')
            st.set_field('start_time', '19:00')
            st.shortlist = [ShortItem(self.app.state.venues.snapshot().venues[0].id)]
            st.allergy_unresolved = unresolved
            st.pending = Pending('seed', 'confirm_plan' if pending == 'confirm_plan' else 'clarify_slot',
                                 [], None if pending == 'confirm_plan' else pending)
            s.revision += 1
            self.rev = s.revision

    def test_flag_matrix_and_cache(self):
        for chat, guided, expected in [('0','1',False), ('1','0',False), ('1','1',True)]:
            with patch.dict(os.environ, {'FOODTOUR_CHAT_V2':chat, 'FOODTOUR_UI_GUIDED':guided}):
                self.assertIs(self.client.get('/v1/client-config').json()['features']['guided_ui'], expected)
                if chat == '0':
                    self.assertEqual(self.client.post(self.url+'/chat', headers=self.headers,
                        json={'revision':self.rev, 'text':'hello'}).status_code, 404)
                else:
                    self.post(text='hello')
                    self.assertIs(self.app.state.chat_engine_cache[1].guided, expected)
        with patch.dict(os.environ, {'FOODTOUR_UI_GUIDED':''}):
            self.assertFalse(self.client.get('/v1/client-config').json()['features']['guided_ui'])

    def test_guided_wire_and_eight_allergy_options(self):
        v = self.post(text=CUE)
        self.assertNotIn('llm_budget', v)
        self.assertEqual(v['turn']['trigger_reason'], 'uncovered')
        self.assertIn('coverage', v['turn'])
        self.assertEqual(v['turn']['llm_calls'], 0)
        self.assertEqual(v['turn']['llm_budget'], {'session_used':0, 'session_cap':0,
                                                 'daily_remaining_public':'unavailable'})
        clar = next(b for b in v['reply']['blocks'] if b['type'] == 'clarify')
        self.assertEqual(len(clar['options']), 8)
        self.assertEqual(clar['slot'], 'allergy_term')
        self.assertTrue(clar['free_text'])
        self.assertNotIn('chips', clar)  # 6285b8b: options are the chips
        self.assertIn('understood', [b['type'] for b in v['reply']['blocks']])
        self.assertIsNone(v['chat']['profile']['budget']['scope'])
        for key in ('allergy_unresolved', 'goal', 'turns', 'asked', 'llm_used'):
            self.assertNotIn(key, v['chat'])
        self.assertNotIn('context', v['chat']['pending'])

    def test_budget_status_boundaries(self):
        self.post(text='hello')
        # A configured local understander, with no outbound transport.
        from app.chat.llm_understand import LLMUnderstander
        self.app.state.chat_engine_cache = (*self.app.state.chat_engine_cache[:2], LLMUnderstander(None))
        for remaining, status in [(6,'ok'), (5,'low'), (4,'low'), (3,'exhausted'), (2,'exhausted'), (0,'exhausted')]:
            budget = DailyLLMBudget(10)
            for _ in range(10-remaining): budget.admit()
            self.app.state.llm_budget = budget
            v = self.act('search', query='phở')
            self.assertEqual(v['turn']['llm_budget']['daily_remaining_public'], status)
            self.assertNotIn('llm_budget', v)
        self.app.state.chat_engine_cache = (*self.app.state.chat_engine_cache[:2], None)
        self.assertEqual(self.post(text='hello')['turn']['llm_budget']['daily_remaining_public'], 'unavailable')

    def test_metadata_allowlist_and_malformed_blocks(self):
        self.post(text='hello')
        eng = self.app.state.chat_engine_cache[1]
        original = eng.handle
        def hostile(*args, **kw):
            r = original(*args, **kw)
            r.trigger_reason = ['PRIVATE_TEXT']
            r.coverage = [{'kind':'allergy', 'status':'captured', 'private':'PRIVATE_TEXT'},
                          {'kind':'PRIVATE_TEXT', 'status':'asked'}]
            r.llm_calls = 'PRIVATE_TEXT'
            r.state.llm_used = -5
            r.blocks = [{'type':'understood','items':None,'allergies':False,'future':7},
                        {'type':'clarify','pending_id':'synthetic','question':'test','options':[],
                         'slot':[], 'chips':'bad', 'free_text':{}, 'future':7},
                        {'type':'future_block','future':{'value':7}},
                        {'type':'text','text':'synthetic','future':7}]
            return r
        with patch.object(eng, 'handle', side_effect=hostile):
            v = self.post(text='hello')
        self.assertIsNone(v['turn']['trigger_reason'])
        self.assertNotIn('PRIVATE_TEXT', json.dumps(v['turn']))
        self.assertEqual(v['turn']['llm_calls'], 0)
        self.assertEqual(v['reply']['blocks'][2], {'type':'future_block','future':{'value':7}})
        self.assertEqual(v['reply']['blocks'][3]['future'], 7)

    def test_valid_metadata_strips_extra_keys_and_bounds_counts(self):
        self.post(text='hello')
        eng = self.app.state.chat_engine_cache[1]
        original = eng.handle
        from app.chat.llm_understand import LLMUnderstander
        self.app.state.chat_engine_cache = (*self.app.state.chat_engine_cache[:2], LLMUnderstander(None))
        self.app.state.llm_budget = DailyLLMBudget(18)
        for count in (True, -1, 2, 2**40, 1.0, None, 0, 1):
            def altered(*args, **kw):
                r = original(*args, **kw)
                r.trigger_reason = 'conflict'
                r.coverage = [{'kind':'budget', 'status':'asked', 'private':'synthetic secret'}]
                r.llm_calls = count
                r.state.llm_used = 2**40
                return r
            with patch.object(eng, 'handle', side_effect=altered):
                v = self.act('search', query='phở')
            self.assertEqual(v['turn']['trigger_reason'], 'conflict')
            self.assertEqual(v['turn']['coverage'], {'signals':[{'kind':'budget','status':'asked'}], 'complete':True})
            self.assertEqual(v['turn']['llm_calls'], count if type(count) is int and count in (0,1) else 0)
            self.assertEqual(v['turn']['llm_budget']['session_used'], 0)

    def test_guided_dialogue_can_plan_after_explicit_resolution(self):
        from tests.chat.test_u0_s0 import S0
        v = self.post(text=S0.replace('120 phút', '240 phút'))
        self.assertEqual(v['chat']['pending']['slot'], 'budget_scope')
        self.assertIsNone(v['tour'])
        self.act('pick_option', option_id='scope:group')
        self.post(text='19h')
        self.act('pick_option', option_id='veh:walk')
        v = self.act('pick_option', option_id='propose:use')
        self.assertIsNone(v['tour'])
        self.assertEqual(v['chat']['pending']['kind'], 'confirm_plan')
        self.restart()
        v = self.act('confirm_yes')
        self.assertTrue(v['tour']['stops'])
        self.assertIn('tour_ready', [b['type'] for b in v['reply']['blocks']])

    def test_stale_allergy_option_is_not_accepted(self):
        self.post(text=CUE)
        v = self.act('pick_option', option_id='allergy:invented')
        self.assertIsNone(v['tour'])
        self.assertEqual(v['chat']['allergies'], [])
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            self.assertTrue(s.chat.allergy_unresolved)

    def test_action_sequence_and_reload(self):
        self.seed()
        with patch('app.api.routes.plan_selected') as planner:
            for kind, args in [('edit_profile', {'patch':{'party_size':2}}), ('request_plan', {}), ('confirm_yes', {})]:
                v = self.act(kind, **args)
                self.assertIsNone(v['tour'])
                self.restart()
            planner.assert_not_called()
        self.assertEqual(v['chat']['pending']['slot'], 'allergy_term')
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            self.assertTrue(s.chat.allergy_unresolved)

    def test_stale_confirm_plan(self):
        self.seed('confirm_plan')
        self.restart()
        with patch('app.api.routes.plan_selected') as planner:
            v = self.act('confirm_yes')
            planner.assert_not_called()
        self.assertIsNone(v['tour'])
        self.assertEqual(v['chat']['pending']['slot'], 'allergy_term')

    def test_budget_null_scope_then_party_change(self):
        self.seed('confirm_plan', unresolved=False)
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            s.chat.set_field('budget', 500000)
            s.chat.set_field('party_size', 1)
            s.revision += 1
            self.rev = s.revision
        with patch('app.api.routes.plan_selected') as planner:
            v = self.act('edit_profile', patch={'party_size':2})
            self.assertIsNone(v['chat']['profile']['budget']['scope'])
            self.restart()
            self.act('request_plan')
            v = self.act('confirm_yes')
            planner.assert_not_called()
        self.assertIsNone(v['tour'])
        self.assertEqual(v['chat']['pending']['slot'], 'budget_scope')

    def test_defence_in_depth_against_engine_plan_and_replace(self):
        for obligation in ('persisted', 'allergy', 'ai', 'budget'):
            with self.subTest(obligation=obligation):
                self.seed('confirm_plan', unresolved=obligation in ('persisted','allergy'))
                self.post(text='hello')
                eng = self.app.state.chat_engine_cache[1]
                original = eng.handle
                def buggy(*args, **kw):
                    r = original(*args, **kw)
                    if obligation == 'persisted': r.state.allergy_unresolved = False
                    if obligation == 'ai': r.state.allergies = [Allergy('synthetic', source='ai_unconfirmed')]
                    if obligation == 'budget':
                        r.state.set_field('budget', 500000)
                        r.state.set_field('party_size', 2)
                    r.plan_request = {'venue_ids':[r.state.shortlist[0].venue_id]}
                    r.replace_request = {'refs':[]}
                    r.blocks = [{'type':'text','text':'synthetic engine reply'}]
                    return r
                with patch.object(eng,'handle',side_effect=buggy), patch('app.api.routes.plan_selected') as planner, \
                        patch('app.api.routes.replace_chat_stop') as replace:
                    v = self.act('confirm_yes')
                    planner.assert_not_called()
                    replace.assert_not_called()
                    self.assertIsNone(v['tour'])
                    self.assertEqual(v['reply']['blocks'], [{'type':'text','text':'synthetic engine reply'}])

    def test_private_state_and_old_rows_roundtrip(self):
        self.seed()
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            s.chat.goal = 'tour'
            s.chat.set_field('stops', 4)
            s.chat.set_field('day_part', 'evening')
            s.chat.pending.context = {'synthetic_private':True}
            s.revision += 1
            self.rev = s.revision
        self.restart()
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            self.assertTrue(s.chat.allergy_unresolved)
            self.assertEqual(s.chat.goal, 'tour')
            self.assertEqual(s.chat.profile['stops'].value, 4)
            self.assertEqual(s.chat.profile['day_part'].value, 'evening')
            self.assertTrue(s.chat.pending.context['synthetic_private'])
        v = self.client.get(self.url, headers=self.headers).json()['chat']
        self.assertIsNone(v['profile']['budget']['scope'])
        self.assertNotIn('goal', v)
        with closing(sqlite3.connect(self.db)) as db:
            raw = json.loads(db.execute('SELECT chat FROM sessions WHERE id=?',(self.sid,)).fetchone()[0])
            for k in ('goal','allergy_unresolved'): raw.pop(k)
            for k in ('stops','day_part'): raw['profile'].pop(k)
            db.execute('UPDATE sessions SET chat=? WHERE id=?', (json.dumps(raw), self.sid))
            db.commit()
        self.restart()
        with self.app.state.sessions.owned(self.sid, self.token) as s:
            self.assertFalse(s.chat.allergy_unresolved)
            self.assertIsNone(s.chat.goal)
            self.assertIsNone(s.chat.profile['stops'].value)
            self.assertIsNone(s.chat.profile['day_part'].value)

    def test_flag_off_golden_chat_messages(self):
        expected = json.loads((Path(__file__).parent/'u3_v18_golden.json').read_text(encoding='utf-8'))
        self.assertEqual(record(), expected)


class DurableLedger(unittest.TestCase):
    def test_app_smoke_and_restart_share_atomic_counter(self):
        from app.repositories.llm_budget import ledger_record, ledger_remaining
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
                'FOODTOUR_SESSION_DB':str(Path(tmp)/'sessions.sqlite'),
                'FOODTOUR_BUDGET_DB':'', 'FOODTOUR_LLM_DAILY_BUDGET':'18'}):
            db = os.environ['FOODTOUR_SESSION_DB']+'.budget.sqlite'
            app = DailyLLMBudget(18, db_path=db)
            app.admit()
            ledger_record(2, 'smoke')
            self.assertEqual(app.snapshot()['used'], 3)
            ledger_record(1, 'app')
            self.assertEqual(ledger_remaining(), 14)
            self.assertEqual(DailyLLMBudget(18, db_path=db).snapshot()['remaining'],14)
            for calls, source in [(True,'app'),(-1,'app'),(1.5,'app'),(1,'private text')]:
                with self.assertRaises(ValueError): ledger_record(calls,source)
            self.assertEqual(ledger_remaining(),14)

    def test_explicit_db_concurrency_and_overlimit(self):
        from concurrent.futures import ThreadPoolExecutor
        from app.repositories.llm_budget import ledger_record, ledger_remaining
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
                'FOODTOUR_SESSION_DB':'', 'FOODTOUR_BUDGET_DB':str(Path(tmp)/'budget.sqlite'),
                'FOODTOUR_LLM_DAILY_BUDGET':'18'}):
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda _:ledger_record(2,'smoke'), range(10)))
            self.assertEqual(ledger_remaining(),0)
            self.assertEqual(DailyLLMBudget(18,db_path=os.environ['FOODTOUR_BUDGET_DB']).snapshot()['used'],20)

    def test_reset_exhaustion_and_no_accidental_memory_counter(self):
        from datetime import datetime, timedelta, timezone
        from app.repositories.llm_budget import ledger_remaining
        with patch.dict(os.environ, {'FOODTOUR_SESSION_DB':'','FOODTOUR_BUDGET_DB':''}):
            with self.assertRaises(ValueError): ledger_remaining()
        with tempfile.TemporaryDirectory() as tmp:
            now = [datetime(2026,10,17,18,tzinfo=timezone.utc)]
            ledger = DailyLLMBudget(18, db_path=str(Path(tmp)/'budget.sqlite'), clock=lambda:now[0])
            ledger.ledger_record(2, 'smoke')
            window = ledger.admit()
            ledger.exhaust(window)
            self.assertEqual(ledger.ledger_remaining(), 0)
            now[0] += timedelta(days=1)
            self.assertEqual(ledger.ledger_remaining(), 18)
