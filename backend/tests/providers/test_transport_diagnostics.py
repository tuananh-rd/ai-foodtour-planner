"""Safe HTTP diagnostics with fake opener; no network or real credentials."""
import io
import json
import unittest
from email.message import Message
from types import SimpleNamespace
from urllib.error import HTTPError
from unittest.mock import patch
from app.providers.http_transport import request_bytes
from app.llm.provider import ProviderError


class DiagnosticTests(unittest.TestCase):
    def fake403(self,body,headers):
        def open_error(*a,**k):raise HTTPError('http://127.0.0.1:9911/chat/completions',403,'Forbidden',headers,io.BytesIO(body))
        return SimpleNamespace(open=open_error)

    def test403_capture_allowlisted_headers_and_code_without_message_or_credentials(self):
        headers=Message();headers['Content-Type']='application/json; charset=utf-8'
        headers['x-request-id']='request_test';headers['cf-ray']='test-SIN'
        headers['Set-Cookie']='synthetic-secret';headers['Authorization']='Bearer synthetic-secret'
        diagnostics={}
        with patch('app.providers.http_transport.build_opener',return_value=self.fake403(
            b'{"error":{"code":"access_denied","message":"synthetic-secret"}}',headers)):
            with self.assertRaises(ProviderError) as error:request_bytes('http://127.0.0.1:9911/chat/completions',diagnostics=diagnostics)
        self.assertEqual(error.exception.status,403)
        self.assertEqual(diagnostics,{'http_status':403,'content_type':'application/json',
            'x-request-id':'request_test','cf-ray':'test-SIN','error_code':'access_denied'})
        self.assertNotIn('synthetic-secret',json.dumps(diagnostics))

    def test403_oversized_nonjson_or_keylike_code_not_captured(self):
        for content_type,body in [('text/html',b'<html>synthetic-private</html>'),
                ('application/json',b'{"error":{"code":"sk-synthetic-secret"}}'),
                ('application/json',b'x'*5000)]:
            headers=Message();headers['Content-Type']=content_type;diagnostics={}
            with patch('app.providers.http_transport.build_opener',return_value=self.fake403(body,headers)):
                with self.assertRaises(ProviderError):request_bytes('http://127.0.0.1:9911/chat/completions',diagnostics=diagnostics)
            self.assertNotIn('error_code',diagnostics)
            self.assertNotIn('synthetic-private',json.dumps(diagnostics))

    def test_cloudflare_integer_nested_code_title_and_action_flags(self):
        envelopes=[{'error_code':1010,'title':'Browser signature banned'},
            {'error':{'error':{'code':1010,'type':'browser_signature_banned',
                'title':'Error code: 1010','retryable':False,'owner_action_required':True,
                'detail':'synthetic-private-secret'}}},
            {'errors':[{'code':1010,'title':'Browser signature banned'}]}]
        for data in envelopes:
            diagnostics={};headers=Message();headers['Content-Type']='application/json'
            with patch('app.providers.http_transport.build_opener',return_value=self.fake403(json.dumps(data).encode(),headers)):
                with self.assertRaises(ProviderError):request_bytes('http://127.0.0.1:9911/chat/completions',diagnostics=diagnostics)
            self.assertEqual(diagnostics['error_code'],1010)
            self.assertEqual(diagnostics['error_title'],'browser_signature_banned')
            self.assertNotIn('synthetic-private-secret',json.dumps(diagnostics))
            if 'error' in data:
                self.assertFalse(diagnostics['retryable']);self.assertTrue(diagnostics['owner_action_required'])

    def test_arbitrary_title_and_bool_code_not_retained(self):
        from app.providers.http_transport import _diagnostic_error
        diagnostics={};_diagnostic_error(diagnostics,{'error':{'code':True,
            'title':'Bearer synthetic-private-key','message':'private','detail':'private'}})
        self.assertEqual(diagnostics,{})
