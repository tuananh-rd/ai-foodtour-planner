"""Real official SDK with in-memory transport, no external endpoint."""
import json
import unittest
import httpx2
from app.providers.apithat_sdk import make_sdk,generate_sdk,BoundedTransport
from app.llm.provider import ProviderError


class SDKTests(unittest.TestCase):
    def test_real_sdk_models_identity_auth_and_no_proxy_retry(self):
        requests=[]
        def mock(request):
            requests.append(request)
            return httpx2.Response(200,json={'object':'list','data':[{'id':'gpt-6-luna','object':'model','created':0,'owned_by':'synthetic'}]})
        with make_sdk('synthetic-key','https://apithat.dev/v1',transport=BoundedTransport(httpx2.MockTransport(mock))) as sdk:
            page=sdk.models.list()
            self.assertEqual(len(page.data),1);self.assertEqual(sdk.max_retries,0)
            self.assertFalse(sdk._client.trust_env);self.assertFalse(sdk._client.follow_redirects)
        self.assertEqual(len(requests),1)
        self.assertEqual(str(requests[0].url),'https://apithat.dev/v1/models')
        self.assertEqual(requests[0].headers['authorization'],'Bearer synthetic-key')
        self.assertTrue(requests[0].headers['user-agent'].startswith('OpenAI/Python '))

    def test_response_sdk_native_wire_and_usage(self):
        requests=[]
        def mock(request):
            requests.append(json.loads(request.content))
            return httpx2.Response(200,json={'id':'resp_test','object':'response','created_at':0,'model':'gpt-6-luna',
                'status':'completed','output':[{'type':'message','id':'msg_test','role':'assistant',
                    'status':'completed','content':[{'type':'output_text','text':'Chào bạn','annotations':[]}]}],
                'usage':{'input_tokens':3,'output_tokens':2,'total_tokens':5,'input_tokens_details':{},'output_tokens_details':{}}})
        diagnostics={}
        data=json.loads(generate_sdk('synthetic','https://apithat.dev/v1','responses',
            {'model':'gpt-6-luna','input':'Chào bạn','max_output_tokens':128,'store':False},12,diagnostics,
            transport=BoundedTransport(httpx2.MockTransport(mock))))
        self.assertEqual(len(requests),1);self.assertEqual(requests[0]['max_output_tokens'],128)
        self.assertEqual(data['usage']['input_tokens'],3);self.assertEqual(diagnostics['http_status'],200)

    def test_sdk403_preserves1010_diagnostic_and_never_retries(self):
        attempts=[]
        def mock(request):
            attempts.append(1)
            return httpx2.Response(403,json={'error':{'code':1010,'type':'browser_signature_banned','retryable':False}},
                                  headers={'cf-ray':'synthetic-SIN'})
        diagnostics={}
        with self.assertRaises(ProviderError) as error:generate_sdk('synthetic','https://apithat.dev/v1','responses',
            {'model':'gpt-6-luna','input':'hello'},12,diagnostics,transport=BoundedTransport(httpx2.MockTransport(mock)))
        self.assertEqual(error.exception.status,403);self.assertEqual(diagnostics['error_code'],1010)
        self.assertEqual(len(attempts),1)

    def test_response_size_and_host_bounds_before_untrusted_read(self):
        def mock(request):return httpx2.Response(200,content=b'x'*100,headers={'content-length':'100'})
        with make_sdk('synthetic','https://apithat.dev/v1',transport=BoundedTransport(httpx2.MockTransport(mock),max_bytes=16)) as sdk:
            from openai import APIConnectionError
            with self.assertRaises(APIConnectionError):sdk.models.list()
        with self.assertRaises(ProviderError):make_sdk('synthetic','https://hostapi.apithat.dev/v1')

    def test_app_client_uses_real_sdk_boundary_after_shared_admission(self):
        import os
        from unittest.mock import patch
        from app.discovery.openai_compatible import ApiThatClient
        from app.repositories.llm_budget import DailyLLMBudget
        budget=DailyLLMBudget(18)
        with patch.dict(os.environ,{'APITHAT_API_KEY':'synthetic','APITHAT_API_MODE':'responses'}), \
             patch('app.providers.apithat_sdk.generate_sdk',return_value=b'{"status":"completed"}') as sdk:
            client=ApiThatClient(budget,base_url='https://apithat.dev/v1',model='gpt-6-luna',enabled=True)
            client.request(b'{"model":"gpt-6-luna","input":"hello"}',3)
            self.assertEqual(budget.snapshot()['used'],1)
            self.assertEqual(sdk.call_args.args[1:3],('https://apithat.dev/v1','responses'))
            self.assertEqual(sdk.call_args.args[3]['model'],'gpt-6-luna')

    def test_raw_empty_model_list_not_sdk_parsing_loss(self):
        def mock(request):return httpx2.Response(200,json={'data':[],'object':'list','success':True})
        with make_sdk('synthetic','https://apithat.dev/v1',transport=BoundedTransport(httpx2.MockTransport(mock))) as sdk:
            response=sdk.models.with_raw_response.list()
            raw=response.http_response.json();page=response.parse()
            self.assertEqual(set(raw),{'data','object','success'})
            self.assertIsInstance(raw['data'],list);self.assertEqual(len(raw['data']),0)
            self.assertEqual(len(page.data),0)

    def test_application_model_not_found_is503_not_waf_or_transport_failure(self):
        attempts=[]
        def mock(request):
            attempts.append(1)
            return httpx2.Response(503,json={'error':{'code':'model_not_found','type':'new_api_error',
                'message':'No available channel for this model in current group'}})
        diagnostics={}
        with self.assertRaises(ProviderError) as error:generate_sdk('synthetic','https://apithat.dev/v1','responses',
            {'model':'gpt-6-luna','input':'hello'},12,diagnostics,transport=BoundedTransport(httpx2.MockTransport(mock)))
        self.assertEqual(error.exception.status,503);self.assertEqual(diagnostics['error_code'],'model_not_found')
        self.assertEqual(diagnostics['error_type'],'new_api_error');self.assertEqual(attempts,[1])

    def test_explicit_60second_sdk_deadline_no_retry(self):
        with make_sdk('synthetic','https://apithat.dev/v1',deadline=60,
            transport=BoundedTransport(httpx2.MockTransport(lambda r:httpx2.Response(200,json={})),deadline=60)) as sdk:
            self.assertEqual(sdk.timeout,60);self.assertEqual(sdk._client.timeout.read,60)
            self.assertEqual(sdk.max_retries,0)
