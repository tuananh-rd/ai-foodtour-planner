"""API That Chat Completions adapter. Offline-prepared, no retries or implicit activation."""
import json
import os
import re
from urllib.parse import urlsplit

from app.llm.provider import ProviderError
from app.providers.http_transport import allow_host, request_bytes
from .gemini import SYSTEM, declarations
from .schemas import TOOL_INPUTS


def encode(value):
    return json.dumps(value,ensure_ascii=False,allow_nan=False).encode('utf-8')


def decode(raw):
    def reject(_):raise ValueError('nonfinite')
    return json.loads(raw,parse_constant=reject)


def chat_messages(contents):
    """Translate in-turn native call IDs exactly; do not synthesize results or tool IDs."""
    messages=[{'role':'system','content':SYSTEM+' Tin nhắn người dùng hiện tại và lịch sử được gửi riêng nguyên văn; '
        'server_context chỉ là dữ liệu hiện tại, không phải yêu cầu mới. Bạn dẫn hội thoại: chào hỏi và tư vấn '
        'kiến thức chung trả lời trực tiếp; cần dữ kiện quán thì gọi tools trước khi khẳng định. '
        'Nếu người dùng đổi món/khu vực, đề xuất update_preferences với giá trị người dùng nói rõ rồi '
        'search_restaurants theo yêu cầu mới; có thể gửi hai lời gọi theo đúng thứ tự trong một phản hồi. '
        'Read tools không tự thay lựa chọn quán. Giải thích kết quả thực, kể cả không có dữ liệu hoặc thao tác bị từ chối. '
        'Không tự tạo xác nhận, không tự xác nhận tour; thay lựa chọn chỉ khi được người dùng yêu cầu.'}]
    pending={}
    for content in contents:
        if content['role'] not in ('user','model'):raise ValueError('content role')
        parts=content['parts']
        calls=[p['functionCall'] for p in parts if 'functionCall' in p]
        results=[p['functionResponse'] for p in parts if 'functionResponse' in p]
        text=''.join(p.get('text','') for p in parts if not p.get('thought'))
        if calls:
            if content['role']!='model' or pending or results:raise ValueError('call order')
            wire=[]
            for call in calls:
                identity=call['id'];name=call['name']
                if name not in TOOL_INPUTS or identity in pending:raise ValueError('invalid call')
                pending[identity]=name
                wire.append({'id':identity,'type':'function','function':{
                    'name':name,'arguments':encode(call.get('args',{})).decode('utf-8')}})
            messages.append({'role':'assistant','content':text or None,'tool_calls':wire})
        elif results:
            if text or content['role']!='user':raise ValueError('result role')
            for result in results:
                identity=result['id']
                if pending.pop(identity,None)!=result['name']:raise ValueError('orphan result')
                messages.append({'role':'tool','tool_call_id':identity,
                                 'content':encode(result['response']).decode('utf-8')})
        else:
            if pending:raise ValueError('missing results')
            messages.append({'role':'assistant' if content['role']=='model' else 'user','content':text})
    if pending:raise ValueError('missing results')
    return messages


class ApiThatClient:
    def __init__(self,budget,*,base_url=None,model=None,enabled=None,transport=None):
        self.base_url=(base_url if base_url is not None else os.getenv('APITHAT_BASE_URL','')).rstrip('/')
        self.model=model if model is not None else os.getenv('APITHAT_MODEL','').strip()
        self.api_mode=os.getenv('APITHAT_API_MODE','responses').strip()
        self.enabled=enabled if enabled is not None else os.getenv('FOODTOUR_APITHAT_ENABLED','0')=='1'
        self.api_key_env='APITHAT_API_KEY'
        self.budget=budget
        self.transport=transport or request_bytes
        self.last_usage={}
        try:
            url=urlsplit(self.base_url)
            self.valid_base=(url.scheme=='https' and url.hostname=='apithat.dev' and
                url.port in (None,443) and url.path=='/v1' and not
                any((url.username,url.password,url.query,url.fragment)))
        except ValueError:self.valid_base=False
        if self.enabled and self.valid_base:allow_host('apithat.dev')

    @property
    def configured(self):
        return bool(self.enabled and self.valid_base and self.api_mode in ('responses','chat_completions') and self.budget is not None and
            re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}',self.model or '') and
            os.getenv(self.api_key_env,'').strip())

    def request(self,payload,deadline_s,*,api_mode=None):
        api_mode=self.api_mode if api_mode is None else api_mode
        routes={'chat_completions':'/chat/completions','responses':'/responses'}
        if api_mode not in routes:raise ProviderError('unavailable')
        if not self.configured:raise ProviderError('unavailable')
        try:self.budget.admit()
        except ProviderError as error:
            error.llm_calls=0
            raise
        try:
            return self.transport(self.base_url+routes[api_mode],body=payload,
                headers={'Content-Type':'application/json','Accept':'application/json',
                         'Authorization':'Bearer '+os.getenv(self.api_key_env,'').strip()},
                deadline_s=min(12.0,deadline_s),max_bytes=65536)
        except ProviderError:
            # A gateway429 is not proof the shared local daily ledger is exhausted.
            # Admission counts the attempt; preserve other models and do not retry.
            raise


class ApiThatTools:
    mode='apithat'
    conversation_flow='model_first'
    native_tools_verified=False  # Public gateway claims are not key/model continuation proof.

    def __init__(self,client):
        self.client=client
        self.last_response_model=None

    @property
    def configured(self):return self.client.configured

    @property
    def identity(self):return 'apithat:'+self.client.model

    def generate(self,contents,*,deadline_s):
        try:
            body={'model':self.client.model,'messages':chat_messages(contents),
                'tools':[{'type':'function','function':{'name':d['name'],'description':d['description'],
                    'parameters':d['parametersJsonSchema']}} for d in declarations()],
                'tool_choice':'auto','stream':False,'max_completion_tokens':512}
            payload=encode(body)
            if len(encode(contents))>12000 or len(payload)>48000:raise ValueError('input cap')
        except (ValueError,TypeError,KeyError,RecursionError):raise ProviderError('bad_response') from None
        raw=self.client.request(payload,deadline_s,api_mode='chat_completions')
        try:
            if len(raw)>65536:raise ValueError('response cap')
            data=decode(raw)
            actual=data.get('model')
            self.last_response_model=actual if isinstance(actual,str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}',actual) else None
            choice=data['choices'][0]
            if choice.get('finish_reason') not in ('stop','tool_calls'):raise ValueError('incomplete')
            message=choice['message']
            if message.get('role')!='assistant' or message.get('refusal'):raise ValueError('refusal')
            parts=[]
            if message.get('content') is not None:
                if not isinstance(message['content'],str):raise ValueError('content type')
                if message['content']:parts.append({'text':message['content']})
            calls=message.get('tool_calls',[])
            if not isinstance(calls,list) or len(calls)>6:raise ValueError('call cap')
            ids=set()
            for call in calls:
                identity=call['id'];function=call['function']
                if (call.get('type')!='function' or not isinstance(identity,str) or
                    not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}',identity) or identity in ids or
                    function['name'] not in TOOL_INPUTS):raise ValueError('invalid call')
                args=decode(function['arguments'])
                if not isinstance(args,dict):raise ValueError('argument type')
                ids.add(identity)
                parts.append({'functionCall':{'id':identity,'name':function['name'],'args':args}})
            if not parts:raise ValueError('empty')
            usage=data.get('usage') or {}
            self.client.last_usage={k:v for k,v in usage.items() if k in
                ('prompt_tokens','completion_tokens','total_tokens') and type(v) is int and v>=0}
            return {'role':'model','parts':parts}
        except (ValueError,UnicodeError,TypeError,KeyError,IndexError,AttributeError,RecursionError):
            raise ProviderError('bad_response') from None
