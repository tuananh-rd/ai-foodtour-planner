"""Provider-documented official OpenAI SDK, unchanged SDK identity, bounded transport."""
import json
import logging
import re
import time
import httpx2
from openai import OpenAI,APIStatusError,APITimeoutError,APIConnectionError
from app.llm.provider import ProviderError
from .http_transport import _diagnostic_headers,_diagnostic_error


class BoundedStream(httpx2.SyncByteStream):
    def __init__(self,stream,started,deadline,max_bytes):
        self.stream=stream;self.started=started;self.deadline=deadline;self.max_bytes=max_bytes
    def __iter__(self):
        size=0
        for chunk in self.stream:
            size+=len(chunk)
            if time.monotonic()-self.started>self.deadline:raise httpx2.ReadTimeout('Provider deadline exceeded')
            if size>self.max_bytes:raise httpx2.ReadError('Provider response size cap')
            yield chunk
    def close(self):self.stream.close()


class BoundedTransport(httpx2.BaseTransport):
    def __init__(self,inner=None,deadline=12,max_bytes=65536):
        self.inner=inner or httpx2.HTTPTransport(verify=True,trust_env=False,retries=0)
        self.deadline=deadline;self.max_bytes=max_bytes
    def handle_request(self,request):
        if (request.url.scheme!='https' or request.url.host!='apithat.dev' or request.url.port not in (None,443)
            or request.url.path not in ('/v1/models','/v1/responses','/v1/chat/completions')):
            raise httpx2.ConnectError('Provider endpoint not allowed')
        started=time.monotonic();response=self.inner.handle_request(request)
        length=response.headers.get('content-length')
        if length is not None and (not length.isdigit() or int(length)>self.max_bytes):
            response.close();raise httpx2.ReadError('Provider response size cap')
        response.stream=BoundedStream(response.stream,started,self.deadline,self.max_bytes)
        return response
    def close(self):self.inner.close()


def make_sdk(key,base_url,*,deadline=12,transport=None):
    if base_url.rstrip('/')!='https://apithat.dev/v1':raise ProviderError('unavailable')
    for name in ('openai','httpx2','httpcore2'):logging.getLogger(name).disabled=True
    http=httpx2.Client(transport=transport or BoundedTransport(deadline=deadline),
        trust_env=False,verify=True,follow_redirects=False,timeout=httpx2.Timeout(min(60,deadline)))
    # No default_headers override: real SDK's own identification is preserved.
    return OpenAI(api_key=key,base_url=base_url,max_retries=0,http_client=http,timeout=min(60,deadline))


def safe_status(error,diagnostics):
    response=error.response
    _diagnostic_headers(diagnostics,error.status_code,response.headers)
    try:
        if diagnostics.get('content_type')=='application/json' and len(response.content)<=4096:
            data=response.json();_diagnostic_error(diagnostics,data)
            nested=data.get('error',{}) if isinstance(data,dict) else {}
            message=nested.get('message',data.get('message','')) if isinstance(nested,dict) else ''
            if isinstance(message,str):
                for pattern,summary in (
                    (r'insufficient.*(?:quota|balance)|quota.*exceed|余额不足|额度.*(?:不足|用尽)', 'provider_reports_insufficient_quota_or_balance'),
                    (r'(?:model|模型).*(?:not found|does not exist|not available|无权限|不存在|不可用)', 'provider_reports_model_unavailable_or_not_permitted'),
                    (r'(?:invalid|expired).*(?:token|key)|无效.*令牌|令牌.*过期', 'provider_reports_invalid_or_expired_credential'),
                    (r'unsupported.*(?:parameter|argument)|unknown.*parameter', 'provider_reports_unsupported_request_parameter')):
                    if re.search(pattern,message,re.I):diagnostics['message_summary']=summary;break
    except (ValueError,TypeError,AttributeError):pass


def generate_sdk(key,base_url,api_mode,body,deadline,diagnostics=None,*,transport=None):
    """Exactly one admitted generation; caller owns shared ledger admission."""
    diagnostics=diagnostics if diagnostics is not None else {}
    try:
        with make_sdk(key,base_url,deadline=deadline,transport=transport) as sdk:
            if api_mode=='responses':raw=sdk.responses.with_raw_response.create(**body)
            elif api_mode=='chat_completions':raw=sdk.chat.completions.with_raw_response.create(**body)
            else:raise ProviderError('unavailable')
            _diagnostic_headers(diagnostics,raw.status_code,raw.headers)
            data=raw.parse().model_dump(mode='json',exclude_unset=True)
            encoded=json.dumps(data,ensure_ascii=False,allow_nan=False).encode('utf-8')
            if len(encoded)>65536:raise ProviderError('bad_response')
            return encoded
    except APIStatusError as error:
        safe_status(error,diagnostics)
        raise ProviderError('quota' if error.status_code==429 else 'unavailable',status=error.status_code) from None
    except APITimeoutError:raise ProviderError('timeout') from None
    except APIConnectionError:raise ProviderError('unavailable') from None
