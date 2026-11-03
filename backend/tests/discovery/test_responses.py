"""Synthetic Responses wire contracts. No gateway requests or real credentials."""
import copy
import json
import os
import unittest
from unittest.mock import patch
from app.discovery.openai_compatible import ApiThatClient
from app.discovery.responses import ApiThatResponsesTools,responses_input
from app.discovery.engine import handle
from app.discovery.experience import ChatModels
from app.discovery.gemini import GeminiTools
from app.llm.provider import ProviderError
from app.repositories.llm_budget import DailyLLMBudget
from backend.tests.discovery.test_apithat import tools


def output(items,status='completed'):
    return json.dumps({'model':'gpt-6-luna','status':status,'output':items,
        'usage':{'input_tokens':14,'output_tokens':9,'total_tokens':23}}).encode()


def text(value):return {'id':'msg_test','type':'message','role':'assistant','status':'completed',
                        'content':[{'type':'output_text','text':value,'annotations':[]}]}


def call(identity='call_read',name='search_restaurants'):
    return {'id':'fc_distinct_item_id','type':'function_call','call_id':identity,
            'name':name,'arguments':'{}','status':'completed'}


class ResponsesTests(unittest.TestCase):
    def setUp(self):
        env=patch.dict(os.environ,{'APITHAT_API_KEY':'synthetic-key','APITHAT_API_MODE':'responses'})
        env.start();self.addCleanup(env.stop)

    def model(self,transport):return ApiThatResponsesTools(ApiThatClient(DailyLLMBudget(18),
        base_url='https://apithat.dev/v1/',model='gpt-6-luna',enabled=True,transport=transport))

    def test_direct_model_reply_original_text_and_explicit_responses_protocol(self):
        requests=[]
        def transport(url,**kwargs):requests.append((url,json.loads(kwargs['body'])));return output([text('Chào bạn, mình có thể tư vấn món Hà Nội.')])
        model=self.model(transport);context=tools();message=' Chào bạn! '
        result,provider=handle(message,context,model=model)
        self.assertEqual(provider['reply_source'],'model');self.assertEqual(provider['response_model'],'gpt-6-luna')
        url,body=requests[0];self.assertEqual(url,'https://apithat.dev/v1/responses')
        self.assertEqual(body['input'][-1],{'role':'user','content':message})
        self.assertFalse(body['store']);self.assertNotIn('previous_response_id',body)
        self.assertEqual(body['max_output_tokens'],512);self.assertNotIn('messages',body)
        self.assertEqual(body['reasoning'],{'effort':'low'})
        self.assertTrue(all(t['type']=='function' and 'name' in t and 'function' not in t and t['strict'] is False for t in body['tools']))
        self.assertEqual(model.client.last_usage,{'input_tokens':14,'output_tokens':9,'total_tokens':23})

    def test_native_calls_use_call_id_and_replay_exact_reasoning_items(self):
        native=[{'id':'rs_test','type':'reasoning','summary':[], 'encrypted_content':'synthetic-opaque-state'},call()]
        requests=[]
        def transport(url,**kwargs):
            requests.append(json.loads(kwargs['body']))
            return output(native) if len(requests)==1 else output([text('Bạn có thể xem kết quả phù hợp trong danh sách.')])
        model=self.model(transport);context=tools()
        result,provider=handle('Tìm giúp món ăn trong dữ liệu',context,model=model)
        self.assertEqual(provider['calls'],2);self.assertEqual(provider['reply_source'],'model')
        self.assertTrue(context.state.results);self.assertEqual(context.state.selection,[])
        sequence=requests[1]['input'];index=next(i for i,item in enumerate(sequence) if item.get('type')=='reasoning')
        self.assertEqual(sequence[index:index+2],native)
        response=sequence[index+2];self.assertEqual(response['type'],'function_call_output')
        self.assertEqual(response['call_id'],'call_read');self.assertNotEqual(response['call_id'],native[1]['id'])
        self.assertEqual(json.loads(response['output'])['status'],'ok')
        self.assertNotIn('synthetic-opaque-state',json.dumps(context.state.dump()))
        self.assertEqual(model.client.budget.snapshot()['used'],2)

    def test_parallel_ids_preserved_and_orphans_rejected(self):
        first={'role':'model','parts':[{'functionCall':{'id':i,'name':'search_restaurants','args':{}}} for i in ('a','b')],
            '_responses_output':[call('a'),call('b')]}
        results={'role':'user','parts':[{'functionResponse':{'id':i,'name':'search_restaurants','response':{'status':'ok'}}} for i in ('b','a')]}
        _,items=responses_input([first,results])
        self.assertEqual([i['call_id'] for i in items if i['type']=='function_call_output'],['b','a'])
        with self.assertRaises(ValueError):responses_input([first])
        altered=copy.deepcopy(first);altered['_responses_output'][0]['call_id']='wrong'
        with self.assertRaises(ValueError):responses_input([altered,results])

    def test_incomplete_refusal_unknown_hosted_tool_duplicate_and_bad_arguments_rejected(self):
        cases=[output([text('partial')],status='incomplete'),output([{'type':'web_search_call'}]),
            output([call(),call()]),output([{**call(),'arguments':'{"x":NaN}'}]),
            output([{**call(),'name':'confirm'}]),output([{'type':'message','role':'assistant',
                'content':[{'type':'refusal','refusal':'synthetic'}]}]),b'not-json']
        for raw in cases:
            with self.subTest(length=len(raw)):
                with self.assertRaises(ProviderError) as error:self.model(lambda *a,**k:raw).generate(
                    [{'role':'user','parts':[{'text':'hello'}]}],deadline_s=3)
                self.assertEqual(error.exception.kind,'bad_response')

    def test_http403_no_retry_or_chat_protocol_fallback(self):
        requests=[]
        def transport(url,**kwargs):requests.append(url);raise ProviderError('unavailable',status=403)
        model=self.model(transport);result,provider=handle('Chào bạn',tools(),model=model)
        self.assertEqual(requests,['https://apithat.dev/v1/responses'])
        self.assertEqual(provider['mode'],'rules');self.assertEqual(provider['failure']['http_status'],403)
        self.assertEqual(model.client.budget.snapshot()['used'],1)

    def test_privacy_and_disabled_catalog_not_bypassed_by_protocol_change(self):
        requests=[];model=self.model(lambda *a,**k:requests.append(1))
        result,provider=handle('Tôi dị ứng đậu phộng',tools(),model=model)
        self.assertEqual(requests,[]);self.assertEqual(provider['calls'],0)
        row=ChatModels(GeminiTools(None),model).catalog(3)[-1]
        self.assertEqual(row['api_mode'],'responses');self.assertFalse(row['available'])
        self.assertFalse(row['native_tools_verified'])

    def test_invalid_api_mode_refused_before_admission(self):
        requests=[];model=self.model(lambda *a,**k:requests.append(1));model.client.api_mode='anthropic'
        self.assertFalse(model.configured)
        with self.assertRaises(ProviderError):model.client.request(b'{}',3,api_mode='other')
        self.assertEqual(model.client.budget.snapshot()['used'],0);self.assertEqual(requests,[])

    def test_explicit_client_api_mode_routes_without_base_or_model_changes(self):
        requests=[];model=self.model(lambda url,**k:requests.append(url) or b'{}')
        model.client.request(b'{}',3)
        model.client.api_mode='chat_completions';model.client.request(b'{}',3)
        self.assertEqual(requests,['https://apithat.dev/v1/responses','https://apithat.dev/v1/chat/completions'])
        self.assertEqual(model.client.model,'gpt-6-luna')

    def test_responses_turn_deadline60_legacy_chat_transport12(self):
        deadlines=[]
        model=self.model(lambda url,**kwargs:deadlines.append(kwargs['deadline_s']) or output([text('Chào bạn.')]))
        handle('Chào bạn',tools(),model=model)
        self.assertGreater(deadlines[0],50);self.assertLessEqual(deadlines[0],60)
        model.client.request(b'{}',60,api_mode='chat_completions')
        self.assertEqual(deadlines[-1],12)

    def test_direct_chat_omits_tools_and_rejects_unexpected_tool_calls(self):
        from app.discovery.responses import ApiThatDirectResponsesTools
        requests=[]
        def transport(url,**kwargs):requests.append(json.loads(kwargs['body']));return output([text('Chào bạn.')])
        base=self.model(transport);model=ApiThatDirectResponsesTools(base.client)
        result,provider=handle('Chào bạn',tools(),model=model)
        self.assertEqual(provider['reply_source'],'model')
        self.assertNotIn('tools',requests[0]);self.assertNotIn('tool_choice',requests[0])
        self.assertFalse(model.native_tools_verified)
        bad=ApiThatDirectResponsesTools(self.model(lambda *a,**k:output([call()])).client)
        with self.assertRaises(ProviderError):bad.generate([{'role':'user','parts':[{'text':'hello'}]}],deadline_s=60)

    def test_direct_selection_does_not_bypass_daily_quota_or_refund_usage(self):
        from app.discovery.responses import ApiThatDirectResponsesTools
        base=self.model(lambda *a,**k:output([text('Chào bạn.')]))
        direct=ApiThatDirectResponsesTools(base.client)
        direct.client.budget=DailyLLMBudget(0)
        catalog=ChatModels(GeminiTools(None),direct)
        row=catalog.catalog(3)[-1]
        self.assertTrue(row['selectable']);self.assertFalse(row['available']);self.assertEqual(row['reason'],'quota')
        chosen=catalog.select(direct.identity);self.assertIsNotNone(chosen)
        result,provider=handle('Chào bạn',tools(),model=chosen)
        self.assertEqual(provider['calls'],0);self.assertEqual(provider['failure']['source'],'daily_reserve')
        self.assertEqual(chosen.client.budget.snapshot()['used'],0)

    def test_reviewed_luna_native_capability_exposes_tools_without_bypassing_quota(self):
        from app.discovery.responses import ApiThatLunaResponsesTools
        requests=[]
        base=self.model(lambda url,**kwargs:requests.append(json.loads(kwargs['body'])) or output([text('Hello.')]))
        model=ApiThatLunaResponsesTools(base.client)
        row=ChatModels(GeminiTools(None),model).catalog(3)[-1]
        self.assertTrue(row['native_tools_verified']);self.assertTrue(row['direct_chat_verified'])
        self.assertTrue(row['available']);self.assertNotIn('(tr',row['label'])
        model.generate([{'role':'user','parts':[{'text':'Hello'}]}],deadline_s=60)
        self.assertTrue(requests[0]['tools']);self.assertFalse(requests[0]['store'])
        self.assertEqual(base.client.budget.snapshot()['used'],1)
        model.client.budget=DailyLLMBudget(3)
        self.assertFalse(ChatModels(GeminiTools(None),model).catalog(3)[-1]['available'])
