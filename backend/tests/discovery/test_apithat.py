"""Offline compatible gateway tests. Fake transport only; no credentials or external requests."""
import json
import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from app.discovery.openai_compatible import ApiThatClient,ApiThatTools,chat_messages
from app.discovery.engine import handle
from app.discovery.experience import ChatModels
from app.discovery.gemini import GeminiTools
from app.discovery.schemas import Provider
from app.llm.provider import ProviderError
from app.repositories.llm_budget import DailyLLMBudget
from backend.tests.discovery.test_food_intent_matrix import matrix_data
from app.discovery.state import State
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator


def tools():return Tools(State(),matrix_data(),StraightLineEstimator())


def completion(text=None,calls=None):
    return json.dumps({'model':'gpt-6-luna','choices':[{'finish_reason':'tool_calls' if calls else 'stop',
        'message':{'role':'assistant','content':text,'tool_calls':calls or []}}],
        'usage':{'prompt_tokens':12,'completion_tokens':8,'total_tokens':20}}).encode()


def function(name='search_restaurants',identity='call_read',args=None):
    return {'id':identity,'type':'function','function':{'name':name,'arguments':json.dumps(args or {})}}


class ApiThatTests(unittest.TestCase):
    def setUp(self):
        self.environment=patch.dict(os.environ,{'APITHAT_API_KEY':'synthetic-not-a-real-key'})
        self.environment.start();self.addCleanup(self.environment.stop)

    def model(self,transport,budget=None,**kwargs):
        client=ApiThatClient(budget or DailyLLMBudget(18),base_url='https://apithat.dev/v1/',
            model='gpt-6-luna',enabled=True,transport=transport,**kwargs)
        return ApiThatTools(client)

    def test_real_contract_tool_continuation_and_provider_identity_offline(self):
        requests=[]
        def transport(url,**kwargs):
            requests.append((url,kwargs))
            return completion(calls=[function()]) if len(requests)==1 else completion('Có kết quả phù hợp trong danh sách.')
        model=self.model(transport);context=tools()
        result,provider=handle('tôi muốn ăn phở ở Đống Đa',context,model=model)
        self.assertTrue(context.state.results);self.assertEqual(context.state.selection,[])
        self.assertEqual(provider['mode'],'apithat');self.assertEqual(provider['reply_source'],'model')
        self.assertEqual(provider['response_model'],'gpt-6-luna');self.assertEqual(provider['calls'],2)
        Provider.model_validate(provider)
        self.assertEqual(len(requests),2);self.assertEqual(model.client.budget.snapshot()['used'],2)
        for url,kwargs in requests:
            self.assertEqual(url,'https://apithat.dev/v1/chat/completions')
            self.assertEqual(kwargs['headers']['Authorization'],'Bearer synthetic-not-a-real-key')
            self.assertLessEqual(kwargs['deadline_s'],12)
        body=json.loads(requests[1][1]['body'])
        assistant=next(m for m in body['messages'] if m.get('tool_calls'))
        tool=next(m for m in body['messages'] if m['role']=='tool')
        self.assertEqual(assistant['tool_calls'][0]['id'],tool['tool_call_id'])
        self.assertEqual(tool['tool_call_id'],'call_read')
        self.assertTrue(json.loads(tool['content']))
        self.assertEqual(body['model'],'gpt-6-luna');self.assertEqual(body['max_completion_tokens'],512)

    def test_parallel_tool_ids_and_malformed_continuation_rejected(self):
        contents=[{'role':'model','parts':[{'functionCall':{'id':'a','name':'search_restaurants','args':{}}},
            {'functionCall':{'id':'b','name':'search_restaurants','args':{}}}]},
            {'role':'user','parts':[{'functionResponse':{'id':'b','name':'search_restaurants','response':{'status':'ok'}}},
                {'functionResponse':{'id':'a','name':'search_restaurants','response':{'status':'ok'}}}]}]
        self.assertEqual([m.get('tool_call_id') for m in chat_messages(contents) if m['role']=='tool'],['b','a'])
        with self.assertRaises(ValueError):chat_messages(contents[:1])
        contents[1]['parts'][0]['functionResponse']['id']='unknown'
        with self.assertRaises(ValueError):chat_messages(contents)

    def test_errors_are_one_attempt_and_never_relabelled_success(self):
        for kind,status in [('unavailable',401),('unavailable',403),('unavailable',404),('quota',429),('unavailable',503),('timeout',None)]:
            with self.subTest(kind=kind,status=status):
                attempts=[]
                def transport(*a,**k):attempts.append(1);raise ProviderError(kind,status=status)
                model=self.model(transport)
                with self.assertRaises(ProviderError) as caught:model.generate([{'role':'user','parts':[{'text':'hello'}]}],deadline_s=4)
                self.assertEqual(caught.exception.kind,kind);self.assertEqual(caught.exception.status,status)
                self.assertEqual(len(attempts),1);self.assertEqual(model.client.budget.snapshot()['used'],1)
                self.assertFalse(model.client.budget.snapshot()['exhausted'])

    def test_malformed_truncated_or_unknown_tool_rejected(self):
        values=[b'not-json',completion(calls=[function('unknown_tool')]),
            json.dumps({'choices':[{'finish_reason':'length','message':{'role':'assistant','content':'partial'}}]}).encode(),
            completion(calls=[function(identity='same'),function(identity='same')])]
        for raw in values:
            with self.subTest(size=len(raw)):
                with self.assertRaises(ProviderError) as caught:self.model(lambda *a,**k:raw).generate([{'role':'user','parts':[{'text':'hello'}]}],deadline_s=3)
                self.assertEqual(caught.exception.kind,'bad_response')

    def test_existing_admission_cap_prevents_transport(self):
        attempts=[];model=self.model(lambda *a,**k:attempts.append(1),budget=DailyLLMBudget(0))
        with self.assertRaises(ProviderError) as caught:model.generate([{'role':'user','parts':[{'text':'hello'}]}],deadline_s=3)
        self.assertEqual(caught.exception.kind,'quota');self.assertEqual(caught.exception.llm_calls,0)
        self.assertEqual(attempts,[])

    def test_base_validation_missing_key_and_disabled_are_fail_closed(self):
        for base in ('http://apithat.dev/v1','https://other.invalid/v1','https://apithat.dev/v1/v1',
                     'https://user@apithat.dev/v1','https://apithat.dev/v1?key=bad'):
            self.assertFalse(ApiThatClient(DailyLLMBudget(18),base_url=base,model='gpt-6-luna',enabled=True).configured)
        model=self.model(lambda *a,**k:None);model.client.enabled=False
        self.assertFalse(model.configured)
        with patch.dict(os.environ,{'APITHAT_API_KEY':''}):
            model.client.enabled=True;self.assertFalse(model.configured)

    def test_catalog_keeps_gemini_default_and_unverified_gateway_disabled(self):
        model=self.model(lambda *a,**k:None)
        catalog=ChatModels(GeminiTools(None),model)
        self.assertIsNone(catalog.default)
        self.assertEqual(catalog.available(model.identity,3),(False,'native_tools_unverified'))
        self.assertIsNone(catalog.select(model.identity))
        self.assertFalse(catalog.catalog(3)[-1]['native_tools_verified'])
        self.assertEqual(catalog.catalog(3)[0]['id'],'gemini-3.5-flash-lite')

    def test_private_input_never_reaches_gateway_and_mutation_stays_authorized(self):
        attempts=[];model=self.model(lambda *a,**k:attempts.append(1))
        _,provider=handle('Tôi dị ứng đậu phộng',tools(),model=model)
        self.assertEqual(attempts,[]);self.assertEqual(provider['calls'],0)
        model=self.model(lambda *a,**k:completion(calls=[function('update_foodtour_selection',args={
            'operation':'add','venue_ids':['chicken0'],'selection_version':0})]))
        context=tools();result,provider=handle('tôi muốn ăn phở',context,model=model)
        self.assertEqual(context.state.selection,[])
        self.assertEqual(context.state.results,[])  # Denial does not invent an unrequested rules search.
        self.assertNotEqual(provider.get('reply_source'),'model')

    def test_public_projection_excludes_profile_location_health_and_rejects_invented_price(self):
        requests=[]
        def transport(*args,**kwargs):
            requests.append(kwargs['body'])
            return completion(calls=[function()]) if len(requests)==1 else completion('Món này có giá 99k.')
        context=tools();context.state.patch({'origin':{'lat':21.111111,'lon':105.222222},
            'allergies':['synthetic-private-health']})
        result,provider=handle('tôi muốn ăn phở',context,model=self.model(transport))
        for body in requests:
            text=body.decode('utf-8')
            for private in ('21.111111','105.222222','synthetic-private-health'):
                self.assertNotIn(private,text)
        self.assertNotIn('99k',result['text'])
        self.assertEqual(provider.get('reason'),'safe_answer_rejected')

    def test_gateway429_is_reported_as_provider_failure_with_honest_local_search(self):
        def transport(*a,**k):raise ProviderError('quota',status=429)
        context=tools();result,provider=handle('tôi muốn ăn phở',context,model=self.model(transport))
        self.assertTrue(context.state.results)
        self.assertEqual(provider['mode'],'rules')
        self.assertEqual(provider['reply_source'],'rules')
        self.assertEqual(provider['failure'],{'kind':'quota','source':'provider_http','http_status':429})
        self.assertEqual(provider['calls'],1)

    def test_local_secret_file_allowlist_preserves_caps_and_process_override(self):
        from tools import run_online_assistant as launcher
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'backend').mkdir()
            (root/'backend/.env').write_text('FOODTOUR_LLM_DAILY_BUDGET=17\n',encoding='utf-8')
            (root/'backend/.env.apithat.local').write_text('APITHAT_BASE_URL=https://apithat.dev/v1\n'
                'APITHAT_MODEL=gpt-6-luna\nAPITHAT_API_KEY=synthetic-file-key\n'
                'FOODTOUR_APITHAT_ENABLED=0\nFOODTOUR_LLM_DAILY_BUDGET=999\nNEXT_PUBLIC_API_KEY=bad\n',encoding='utf-8')
            with patch.object(launcher,'ROOT',root),patch.dict(os.environ,{'APITHAT_API_KEY':'synthetic-process-key'},clear=True):
                launcher.local_configuration()
                self.assertEqual(os.environ['FOODTOUR_LLM_DAILY_BUDGET'],'17')
                self.assertEqual(os.environ['APITHAT_API_KEY'],'synthetic-process-key')
                self.assertEqual(os.environ['APITHAT_MODEL'],'gpt-6-luna')
                self.assertNotIn('NEXT_PUBLIC_API_KEY',os.environ)

    def test_verified_direct_chat_selectable_but_native_tool_capability_stays_false(self):
        from fastapi.testclient import TestClient
        from app.main import create_app
        settings={'FOODTOUR_LLM':'gemini','GEMINI_API_KEY':'synthetic-gemini-key',
            'FOODTOUR_GEMINI_MODEL':'gemini-3.5-flash-lite','FOODTOUR_SESSION_DB':'',
            'FOODTOUR_BUDGET_DB':'','FOODTOUR_MENU_PATH':'','FOODTOUR_EVIDENCE_PATH':'',
            'APITHAT_MODEL':'gpt-6-luna','APITHAT_BASE_URL':'https://apithat.dev/v1','FOODTOUR_APITHAT_ENABLED':'1'}
        with patch.dict(os.environ,settings),TestClient(create_app(data_path=Path('contracts/fixtures/venues.chat.synthetic.json').resolve())) as client:
            capability=client.get('/v1/assistant/capabilities').json()
            self.assertEqual(capability['default_chat_model'],'gemini-3.5-flash-lite')
            row=next(r for r in capability['chat_models'] if r['id']=='apithat:gpt-6-luna')
            self.assertEqual(row['api_mode'],'responses')
            self.assertTrue(row['selectable']);self.assertTrue(row['direct_chat_verified'])
            self.assertFalse(row['native_tools_verified'])
            session=client.post('/v1/sessions').json()
            response=client.post('/v1/sessions/'+session['session_id']+'/assistant',
                headers={'X-Session-Token':session['token']},json={'revision':0,'action':{
                    'type':'settings','arguments':{'chat_model':'apithat:gpt-6-luna'}}}).json()
            self.assertEqual(response['status'],'ok');self.assertEqual(response['provider']['calls'],0)
            self.assertEqual(response['settings']['chat_model'],'apithat:gpt-6-luna')
