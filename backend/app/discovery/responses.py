"""Stateless Responses mapping; exact native output items stay in-turn only."""
import copy
import re
from app.llm.provider import ProviderError
from .openai_compatible import ApiThatTools,chat_messages,encode,decode
from .gemini import declarations
from .schemas import TOOL_INPUTS


def responses_input(contents):
    messages=chat_messages(contents)  # Validate role/order/unique call IDs and all result pairings.
    items=[]
    for content in contents:
        if content['role']=='model' and '_responses_output' in content:
            native=content['_responses_output']
            calls=[p['functionCall'] for p in content['parts'] if 'functionCall' in p]
            native_calls=[i for i in native if i['type']=='function_call']
            if [(c['id'],c['name'],c['args']) for c in calls]!=[(i['call_id'],i['name'],decode(i['arguments'])) for i in native_calls]:
                raise ValueError('native call pairing mismatch')
            items.extend(copy.deepcopy(native))
            continue
        for part in content['parts']:
            if 'functionResponse' in part:
                response=part['functionResponse']
                items.append({'type':'function_call_output','call_id':response['id'],
                              'output':encode(response['response']).decode('utf-8')})
            elif 'functionCall' in part:
                call=part['functionCall']
                items.append({'type':'function_call','call_id':call['id'],'name':call['name'],
                              'arguments':encode(call.get('args',{})).decode('utf-8')})
            elif 'text' in part and not part.get('thought'):
                items.append({'role':'assistant' if content['role']=='model' else 'user','content':part['text']})
    return messages[0]['content'],items


class ApiThatResponsesTools(ApiThatTools):
    turn_deadline_s=60
    expose_tools=True
    direct_chat_verified=False
    native_tools_verified=False  # Separate Responses proof required, never inferred from Chat support.

    def generate(self,contents,*,deadline_s):
        try:
            instructions,items=responses_input(contents)
            body={'model':self.client.model,'instructions':instructions,'input':items,
                'tools':[{'type':'function','name':d['name'],'description':d['description'],
                          'parameters':d['parametersJsonSchema'],'strict':False} for d in declarations()],
                'tool_choice':'auto','stream':False,'store':False,'include':['reasoning.encrypted_content'],
                'max_output_tokens':512}
            if self.client.model=='gpt-6-luna':body['reasoning']={'effort':'low'}
            if not self.expose_tools:
                for key in ('tools','tool_choice','include'):body.pop(key,None)
                body['instructions']+=' Chế độ hiện tại chỉ trò chuyện kiến thức ẩm thực chung; không có công cụ tra cứu quán. Không khẳng định đã tìm quán, kiểm tra menu, giờ mở hay tạo tour. Nếu cần dữ liệu quán chưa có trong ngữ cảnh, nói rõ giới hạn; không tự bịa địa điểm.'
            payload=encode(body)
            if len(encode(contents))>12000 or len(payload)>48000:raise ValueError('input cap')
        except (ValueError,TypeError,KeyError,RecursionError):raise ProviderError('bad_response') from None
        raw=self.client.request(payload,deadline_s,api_mode='responses')
        try:
            if len(raw)>65536:raise ValueError('response cap')
            data=decode(raw)
            if data.get('status')!='completed' or data.get('error') or data.get('incomplete_details'):
                raise ValueError('incomplete or error')
            actual=data.get('model')
            self.last_response_model=actual if isinstance(actual,str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}',actual) else None
            output=data['output']
            if not isinstance(output,list) or not 1<=len(output)<=24:raise ValueError('output cap')
            parts=[];ids=set()
            for item in output:
                kind=item['type']
                if kind=='reasoning':continue  # Opaque exact item is returned below for continuation, not user text.
                if kind=='function_call':
                    if not self.expose_tools:raise ValueError('native tools not enabled')
                    identity=item['call_id'];name=item['name'];args=decode(item['arguments'])
                    if (name not in TOOL_INPUTS or not isinstance(identity,str) or
                        not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}',identity) or identity in ids or
                        not isinstance(args,dict) or item.get('status') not in (None,'completed')):
                        raise ValueError('invalid call')
                    ids.add(identity);parts.append({'functionCall':{'id':identity,'name':name,'args':args}})
                elif kind=='message':
                    if item.get('role')!='assistant' or item.get('status') not in (None,'completed'):raise ValueError('message role/status')
                    for block in item['content']:
                        if block['type']!='output_text' or not isinstance(block.get('text'),str):raise ValueError('unsupported content/refusal')
                        if block['text']:parts.append({'text':block['text']})
                else:raise ValueError('unsupported hosted tool/output')
            if not parts or len(ids)>6:raise ValueError('empty/call cap')
            usage=data.get('usage') or {}
            self.client.last_usage={k:v for k,v in usage.items() if k in
                ('input_tokens','output_tokens','total_tokens') and type(v) is int and v>=0}
            return {'role':'model','parts':parts,'_responses_output':copy.deepcopy(output)}
        except (ValueError,UnicodeError,TypeError,KeyError,IndexError,AttributeError,RecursionError):
            raise ProviderError('bad_response') from None


class ApiThatDirectResponsesTools(ApiThatResponsesTools):
    """Reviewed real greeting proof only; native tool proof remains absent."""
    expose_tools=False
    direct_chat_verified=True
