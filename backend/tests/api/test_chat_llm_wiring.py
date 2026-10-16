import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import create_app
from app.chat.llm_understand import LLMUnderstander
from app.llm.provider import ProviderError
from app.repositories.llm_budget import DailyLLMBudget

FIXTURE = Path(__file__).resolve().parents[3] / 'contracts/fixtures/venues.chat.synthetic.json'
TEXT = 'thay vì ba người thì bốn mà bỏ cua đi nhé, tìm chỗ nào mát mát'

class Stub:
    def __init__(self, answer=None, error=None, budget=None):
        self.answer = answer or {'intent': 'GREET_OR_SMALLTALK'}
        self.error, self.budget, self.calls = error, budget, 0
    def understand(self, text, compact, *, deadline_s):
        self.calls += 1
        if self.budget: self.budget.admit()
        if self.error: raise self.error
        return self.answer

class ChatLLMWiring(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env = patch.dict(os.environ, {'FOODTOUR_CHAT_V2':'1', 'FOODTOUR_LLM':'off',
            'FOODTOUR_EXPLAIN':'template', 'FOODTOUR_ROUTING':'estimate', 'FOODTOUR_GEOCODER':'off',
            'FOODTOUR_SESSION_DB':str(Path(self.tmp.name)/'sessions.sqlite'),
            'FOODTOUR_RATE_LIMIT_TOKEN':'10000', 'FOODTOUR_RATE_LIMIT_IP':'10000'})
        self.env.start(); self.addCleanup(self.env.stop)
    def start(self, provider=None, budget=None):
        self.provider = provider or Stub()
        self.understander = LLMUnderstander(self.provider, budget)
        self.restart()
        session = self.client.post('/v1/sessions').json()
        self.url = '/v1/sessions/'+session['session_id']+'/chat'
        self.headers = {'X-Session-Token':session['token']}
        self.revision = 0
    def restart(self):
        self.app = create_app(data_path=FIXTURE, chat_understander=self.understander)
        self.client = TestClient(self.app)
    def post(self, text=TEXT):
        r = self.client.post(self.url, headers=self.headers, json={'revision':self.revision,'text':text})
        self.assertEqual(r.status_code, 200, r.text)
        self.revision = r.json()['revision']
        return r.json()
    def used(self):
        with self.app.state.sessions.owned(self.url.split('/')[3], self.headers['X-Session-Token']) as s:
            return s.chat.llm_used
    def test_call_cache_and_restart(self):
        self.start()
        first = self.post()
        self.assertEqual((first['llm_calls'], first['extraction_source'], self.provider.calls, self.used()),(1,'llm',1,1))
        # A second fresh session has the same compact state and therefore the same cache key.
        session = self.client.post('/v1/sessions').json()
        r = self.client.post('/v1/sessions/'+session['session_id']+'/chat',headers={'X-Session-Token':session['token']},json={'revision':0,'text':TEXT}).json()
        self.assertEqual((r['llm_calls'], r['extraction_source'],self.provider.calls),(0,'cache',1))
        self.restart()
        self.assertEqual(self.used(),1)
    def test_cap_survives_restart(self):
        self.start(Stub({'intent':'UNKNOWN'}))
        for n in range(6): self.assertEqual(self.post(TEXT+str(n))['llm_calls'],1)
        self.restart()
        r = self.post(TEXT+'capped')
        self.assertEqual((r['llm_calls'],self.provider.calls,self.used()),(0,6,6))
        self.assertEqual(r['chat']['pending']['kind'],'clarify_intent')
        self.assertIn('phiên',json.dumps(r['reply'],ensure_ascii=False).lower())
    def test_reserve_and_exhaustion(self):
        for remaining in (3,0):
            budget = DailyLLMBudget(10)
            for _ in range(10-remaining): budget.admit()
            self.start(budget=budget)
            r = self.post()
            self.assertEqual((r['llm_calls'],self.provider.calls),(0,0))
            self.assertEqual(r['chat']['pending']['kind'],'clarify_intent')
            self.assertIn('AI hết lượt',json.dumps(r['reply'],ensure_ascii=False))
    def test_error_counts(self):
        self.start(Stub(error=ProviderError('timeout')))
        r=self.post()
        self.assertEqual((r['llm_calls'],self.used()),(1,1))
        self.assertEqual(r['chat']['pending']['kind'],'clarify_intent')
    def test_hostile_answers(self):
        for answer in ({'intent':'ROOT'}, {'intent':'UPDATE_PROFILE','patch':{'party_size':999999,'budget_vnd':10**20}},
                       {'intent':'UNSAFE'}, {'intent':'CONFIRM_YES'}):
            self.start(Stub(answer))
            r=self.post()
            self.assertIsNone(r['tour'])
            self.assertEqual(r['chat']['shortlist'],[])
            self.assertIsNone(r['preferences']['party_size'])
            self.assertIsNone(r['preferences']['budget_vnd'])
    def test_gemini_shared_instance_and_snapshot_rebuild(self):
        budget=DailyLLMBudget(18)
        class Client:
            configured=True
            model='stub-model'
            def __init__(self): self.budget=budget
            def generate_json(self,*a,**kw):
                self.budget.admit()
                return {'intent':'GREET_OR_SMALLTALK'}
        client=Client()
        with patch.dict(os.environ, {'FOODTOUR_LLM':'gemini'}), patch('app.main.GeminiClient',return_value=client) as factory:
            app=create_app(data_path=FIXTURE)
        c=TestClient(app); s=c.post('/v1/sessions').json()
        r=c.post('/v1/sessions/'+s['session_id']+'/chat',headers={'X-Session-Token':s['token']},json={'revision':0,'text':TEXT})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(factory.call_count,1)
        self.assertIs(app.state.chat_understander.provider.client,client)
        self.assertIs(app.state.extractor.llm.provider.client,client)
        self.assertIs(app.state.chat_understander.budget,app.state.llm_budget)
        self.assertIs(app.state.chat_understander.gz,app.state.chat_engine_cache[1].gz)
        client.generate_json('','','') # extraction transport consumes the same budget
        self.assertEqual(app.state.llm_budget.snapshot()['used'],2)
        self.assertEqual(r.json()['llm_budget']['remaining'],17)

if __name__=='__main__': unittest.main()
