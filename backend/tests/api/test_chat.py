"""C1 API behaviour over explicitly synthetic data; no network providers."""
from contextlib import closing
import copy
import json
import logging
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import create_app
from app.chat.state import ChatState
from app.repositories.sessions import SessionStore

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / 'contracts/fixtures/venues.chat.synthetic.json'


class ChatAPI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = str(Path(self.temp.name) / 'sessions.sqlite')
        self.env = patch.dict(os.environ, {
            'FOODTOUR_CHAT_V2': 'yes', 'FOODTOUR_SESSION_DB': self.db,
            'FOODTOUR_LLM': 'off', 'FOODTOUR_EXPLAIN': 'template',
            'FOODTOUR_ROUTING': 'estimate', 'FOODTOUR_GEOCODER': 'off',
            'FOODTOUR_RATE_LIMIT_TOKEN': '10000', 'FOODTOUR_RATE_LIMIT_IP': '10000'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.restart()
        session = self.client.post('/v1/sessions').json()
        self.url = '/v1/sessions/' + session['session_id']
        self.headers = {'X-Session-Token': session['token']}
        self.revision = 0

    def restart(self, sessions=None):
        self.app = create_app(data_path=str(FIXTURE), sessions=sessions)
        self.client = TestClient(self.app, raise_server_exceptions=False)

    def post(self, **payload):
        response = self.client.post(self.url + '/chat', headers=self.headers,
                                    json={'revision': self.revision, **payload})
        if response.status_code == 200:
            self.revision = response.json()['revision']
        return response

    def action(self, kind, **kw):
        response = self.post(action={'type': kind, **kw})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def get(self):
        response = self.client.get(self.url, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def prepare(self, duration=240):
        self.action('set_location', location={'district': 'Hoàn Kiếm'})
        view = self.action('search', query='phở')
        ids = [r['venue_id'] for r in view['chat']['last_results'][:2]]
        self.assertEqual(len(ids), 2)
        for identity in ids:
            self.action('add', venue_id=identity)
        self.action('edit_profile', patch={'party_size': 3, 'budget_vnd': 600000,
            'budget_scope': 'group', 'start_time': '10:00', 'duration_min': duration, 'vehicle': 'walk'})
        view = self.action('request_plan')
        self.assertIsNone(view['tour'])
        self.assertEqual(view['chat']['pending']['kind'], 'confirm_plan')
        return ids

    def test_flag_and_config(self):
        self.assertTrue(self.client.get('/v1/client-config').json()['features']['chat_v2'])
        with patch.dict(os.environ, {'FOODTOUR_CHAT_V2': '0'}):
            self.assertFalse(self.client.get('/v1/client-config').json()['features']['chat_v2'])
            response = self.post(text='hello')
            self.assertEqual(response.status_code, 404)
            self.assertIn('error', response.json())
            self.assertEqual(self.client.post(self.url+'/chat',json={'revision':0}).status_code,404)
        self.assertIn('chat', self.get())

    def test_ownership(self):
        payload = {'revision': 0, 'text': 'hello'}
        self.assertEqual(self.client.post(self.url+'/chat', json=payload).status_code, 401)
        other = self.client.post('/v1/sessions').json()
        self.assertEqual(self.client.post(self.url+'/chat', json=payload,
            headers={'X-Session-Token': other['token']}).status_code, 403)

    def test_strict_input(self):
        invalid = [{}, {'text':'a', 'action':{'type':'search'}}, {'text':''}, {'text':'a'*1001},
            {'text':3}, {'text':'a\u200bb'}, {'text':'a\nb'}, {'action':{'type':'invalid'}},
            {'action':{'type':'edit_profile','patch':{'unknown':1}}},
            {'action':{'type':'edit_profile','patch':{'party_size':True}}},
            {'action':{'type':'edit_profile','patch':{'party_size':'4'}}},
            {'action':{'type':'edit_profile','patch':{'party_size':21}}},
            {'action':{'type':'edit_profile','patch':{'budget_vnd':0}}},
            {'action':{'type':'edit_profile','patch':{'start_time':'25:00'}}},
            {'action':{'type':'edit_profile','patch':{'max_leg_min':61}}},
            {'action':{'type':'edit_profile','patch':{'duration_min':721}}},
            {'action':{'type':'edit_profile','patch':{'vehicle':'bus'}}},
            {'action':{'type':'compare','criteria':['invented']}},
            {'action':{'type':'compare','criteria':['price']*4}},
            {'action':{'type':'add','venue_id':'a'*65}},
            {'action':{'type':'add','venue_ids':['a']*5}},
            {'action':{'type':'set_location','location':{'lat':91}}},
            {'action':{'type':'set_location','location':{'lon':'105'}}},
            {'action':{'type':'search','query':'a'*201}}, {'revision':True,'text':'hi'}]
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.post(**payload).status_code, 422)
        self.assertEqual(self.get()['revision'], 0)

    def test_revision_once_and_conflict(self):
        response = self.post(text='tìm quán phở')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.revision,1)
        self.assertEqual(self.post(text='hello',revision=0).status_code,409)
        self.assertEqual(self.get()['revision'],1)

    def test_restart_shortlist_pending_results_allergy(self):
        self.action('set_location', location={'district':'Hoàn Kiếm'})
        self.post(text='dị ứng cua')
        view = self.action('search',query='phở')
        self.action('add',venue_id=view['chat']['last_results'][0]['venue_id'])
        view = self.action('request_plan')
        self.assertIsNotNone(view['chat']['pending'])
        before = self.get()
        self.restart()
        self.assertEqual(self.get(),before)
        self.assertEqual(before['preferences']['allergies'],['cua'])
        updated = self.client.put(self.url+'/preferences', headers=self.headers,
            json={'base_revision':self.revision, 'preferences':{**before['preferences'],'party_size':4}})
        self.assertEqual(updated.status_code,200,updated.text)
        self.restart()
        self.assertEqual(self.get()['preferences']['allergies'],['cua'])

    def test_confirm_exact_selection_and_stale_tour(self):
        ids=self.prepare()
        ready=self.action('confirm_yes')
        self.assertEqual(set(s['venue_id'] for s in ready['tour']['stops']),set(ids))
        self.assertIn('tour_ready',[b['type'] for b in ready['reply']['blocks']])
        old=copy.deepcopy(ready['tour'])
        view=self.action('edit_profile',patch={'party_size':4,'duration_min':30})
        self.assertEqual(view['tour']['stops'],old['stops'])
        self.restart()
        self.assertEqual(self.get()['tour']['stops'],old['stops'])

    def test_conflicting_plan_never_drops_stop(self):
        self.prepare(duration=30)
        view=self.action('confirm_yes')
        self.assertIsNone(view['tour'])
        self.assertIn('plan_conflict',[b.get('code') for b in view['reply']['blocks']])
        self.restart()
        self.assertIsNone(self.get()['tour'])
        self.assertIsNotNone(self.get()['chat']['pending'])

    def test_state_cap_and_exception_roll_back(self):
        self.action('search',query='phở')
        before=self.get()
        reducer=self.app.state.chat_engine_cache[1]
        original=reducer.handle
        def oversized(*args,**kw):
            result=original(*args,**kw)
            result.state.asked=[{'slot':'x'*33000}]
            return result
        with patch.object(reducer,'handle',side_effect=oversized):
            self.assertEqual(self.post(text='hello').status_code,500)
        self.assertEqual(self.get(),before)
        with patch.object(reducer,'handle',side_effect=RuntimeError('private text')):
            response=self.post(text='hello')
            self.assertEqual(response.status_code,500)
            self.assertNotIn('private text',response.text)
        self.assertEqual(self.get(),before)
        from app.api.errors import APIError
        with patch.object(reducer,'handle',side_effect=APIError(422,'validation_error','private text')):
            response=self.post(text='hello')
            self.assertEqual(response.status_code,500)
            self.assertNotIn('private text',response.text)
        self.assertEqual(self.get(),before)

    def test_memory_store_rolls_back(self):
        self.restart(sessions=SessionStore())
        created=self.client.post('/v1/sessions').json()
        self.url='/v1/sessions/'+created['session_id']
        self.headers={'X-Session-Token':created['token']}
        self.test_state_cap_and_exception_roll_back()

    def test_old_database_migration(self):
        with closing(sqlite3.connect(self.db)) as db:
            db.execute('ALTER TABLE sessions DROP COLUMN chat')
            db.commit()
        self.restart()
        view=self.get()
        self.assertEqual(view['chat']['shortlist'],[])
        self.assertEqual(view['chat']['turn_count'],0)
        self.action('search',query='phở')
        with closing(sqlite3.connect(self.db)) as db:
            self.assertIn('chat',[r[1] for r in db.execute('PRAGMA table_info(sessions)')])
            self.assertIsNotNone(db.execute('SELECT chat FROM sessions').fetchone()[0])

    def test_rate_limit(self):
        self.app.state.sessions._rates.rate_limit=1
        self.assertEqual(self.post(text='hello').status_code,200)
        self.assertEqual(self.post(text='hello').status_code,429)

    def test_no_text_in_logs(self):
        marker='SYNTHETIC_PRIVATE_CHAT_123456'
        with self.assertLogs('foodtour.access',level=logging.INFO) as captured:
            response=self.post(text=marker)
        self.assertEqual(response.status_code,200)
        self.assertNotIn(marker,' '.join(captured.output))
        self.assertNotIn(self.headers['X-Session-Token'],' '.join(captured.output))

    def test_engine_cached_per_snapshot(self):
        self.action('search',query='phở')
        first=self.app.state.chat_engine_cache[1]
        self.action('search',query='chè')
        self.assertIs(self.app.state.chat_engine_cache[1],first)

    def test_budget_status_and_no_provider_call(self):
        from app.repositories.llm_budget import DailyLLMBudget
        self.app.state.llm_budget=DailyLLMBudget(0,db_path=str(Path(self.temp.name)/'budget.sqlite'))
        def forbidden(*args,**kw):
            raise AssertionError('C5 is not wired')
        from app.chat.llm_understand import LLMUnderstander
        self.app.state.chat_understander=LLMUnderstander(forbidden, self.app.state.llm_budget)
        response=self.post(text='SYNTHETIC_UNKNOWN')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['llm_calls'],0)
        self.assertEqual(response.json()['turn']['understanding'],'rules')
        health=self.client.get('/health').json()['llm_budget']
        self.assertEqual(health['session_cap'],6)
        self.assertEqual(health['reserve'],3)


    def test_concurrent_revision_has_one_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        def send(_):
            return self.client.post(self.url+'/chat',headers=self.headers,
                json={'revision':0,'action':{'type':'search','query':'phở'}}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(send,range(2))),[200,409])
        self.assertEqual(self.get()['chat']['turn_count'],1)

    def test_chat_expires_with_preferences(self):
        self.action('search',query='phở')
        with sqlite3.connect(self.db) as db:
            db.execute('UPDATE sessions SET expires_at=0')
        db.close()
        self.assertEqual(self.client.get(self.url,headers=self.headers).status_code,410)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute('SELECT preferences,tour,chat FROM sessions').fetchone(),(None,None,None))
        db.close()

    def test_snapshot_change_rebuilds_engine(self):
        from app.repositories.venues import VenueRepository
        self.action('search',query='phở')
        first=self.app.state.chat_engine_cache[1]
        fixture=json.loads(FIXTURE.read_text(encoding='utf-8'))
        if isinstance(fixture,list): fixture[0]['name'] += ' changed'
        else: fixture['venues'][0]['name'] += ' changed'
        new_path=Path(self.temp.name)/'changed.synthetic.json'
        new_path.write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf-8')
        self.app.state.venues=VenueRepository(new_path)
        self.action('search',query='phở')
        self.assertIsNot(self.app.state.chat_engine_cache[1],first)

    def test_nonwalking_plan_survives_restart(self):
        ids=self.prepare()
        self.action('edit_profile',patch={'vehicle':'car'})
        view=self.action('confirm_yes')
        self.assertEqual(set(s['venue_id'] for s in view['tour']['stops']),set(ids))
        self.restart()
        self.assertEqual(self.get()['tour'],view['tour'])

    def test_no_solution_survives_exploration_restart(self):
        self.prepare(duration=30)
        view=self.action('confirm_yes')
        self.assertIsNone(view['tour'])
        self.action('search',query='chè')
        self.restart()
        self.assertIsNone(self.get()['tour'])


    def test_strict_mode_is_not_relaxed(self):
        self.prepare()
        prefs=self.get()['preferences'] | {'mode':'strict'}
        response=self.client.put(self.url+'/preferences',headers=self.headers,
            json={'base_revision':self.revision,'preferences':prefs})
        self.assertEqual(response.status_code,200,response.text)
        self.revision=response.json()['revision']
        view=self.action('confirm_yes')
        self.assertEqual(view['preferences']['mode'],'strict')
        self.assertIsNone(view['tour'])
        self.assertIn('plan_conflict',[b.get('code') for b in view['reply']['blocks']])
        self.restart()
        self.assertIsNone(self.get()['tour'])

    def test_exclusions_are_not_relaxed(self):
        self.prepare()
        prefs=self.get()['preferences'] | {'exclusions':['phở']}
        response=self.client.put(self.url+'/preferences',headers=self.headers,
            json={'base_revision':self.revision,'preferences':prefs})
        self.assertEqual(response.status_code,200,response.text)
        self.revision=response.json()['revision']
        view=self.action('confirm_yes')
        self.assertIsNone(view['tour'])
        self.assertIn('plan_conflict',[b.get('code') for b in view['reply']['blocks']])
