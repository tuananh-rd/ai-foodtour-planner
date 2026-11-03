"""Model-led public dialogue; deterministic code owns privacy and state authority only."""
import copy
import json
import time
from app.llm.provider import ProviderError
from app.chat.conversation_reply import private_turn
from app.assistant.conversation import is_health_or_allergy_disclosure,redact_sensitive


def public_text(text):
    return (isinstance(text,str) and not private_turn(text) and
            not is_health_or_allergy_disclosure(text) and redact_sensitive(text)==text)


def contents_for(tools,text):
    from .engine import model_projection
    context=model_projection(tools,'')
    for key in ('message','recent_general_dialogue','recent_public_user_turns'):context.pop(key,None)
    contents=[{'role':'user','parts':[{'text':json.dumps({'server_context':context},ensure_ascii=False)}]}]
    history=list(tools.state.messages)
    # Routes remember the current user before this function; do not duplicate it.
    if history and history[-1].get('role')=='user' and history[-1].get('text')==text[:700]:history.pop()
    for message in history[-8:]:
        if public_text(message.get('text')):
            contents.append({'role':'model' if message['role']=='assistant' else 'user',
                             'parts':[{'text':message['text']}]})
    contents.append({'role':'user','parts':[{'text':text}]})
    return contents


def handle_model_first(text,tools,*,model,llm_used,session_cap,reserve):
    from .engine import (parse_patch,fallback,references,selection_references,authorized,
                         safe_answer,tool_projection)
    from .schemas import TOOL_INPUTS
    started=time.monotonic()
    turn_deadline=min(60,max(.1,getattr(model,'turn_deadline_s',12)))
    initial_refs=references(text,tools)
    tools.selection_refs=selection_references(text,tools,list(tools.state.results or tools.state.comparison))
    provider={'mode':'apithat','calls':0,'configured_model':model.client.model,'reply_source':'tools'}
    last=None;results=[];failure_source='transport'

    def local(reason):
        # Parse/apply public preferences only after a real failure, never before model admission.
        patch,price=parse_patch(text,tools)
        if patch:tools.run('update_preferences',{'patch':patch})
        provider.update(mode='rules',reply_source='rules',reason=reason+'_rules_fallback')
        return fallback(text,tools,patch,price,initial_refs),provider

    if not public_text(text):return local('private_turn')
    if not model.configured:return local('provider_unavailable')
    contents=contents_for(tools,text)
    try:
        for _ in range(2):  # Existing turn cap, including native continuation.
            remaining=turn_deadline-(time.monotonic()-started)
            if remaining<=.1:
                failure_source='turn_deadline';raise ProviderError('timeout')
            if llm_used+provider['calls']>=session_cap:
                failure_source='session_cap';raise ProviderError('quota')
            if model.client.budget.snapshot()['remaining']<=reserve:
                failure_source='daily_reserve';raise ProviderError('quota')
            provider['calls']+=1;failure_source='transport'
            content=model.generate(copy.deepcopy(contents),deadline_s=remaining)
            provider['response_model']=model.last_response_model
            if content.get('role')!='model' or not isinstance(content.get('parts'),list):raise ProviderError('bad_response')
            calls=[p['functionCall'] for p in content['parts'] if 'functionCall' in p]
            if not calls:
                answer=''.join(p.get('text','') for p in content['parts'] if not p.get('thought'))
                grounded=safe_answer(answer,tools,results)
                if grounded and (last is None or last['status'] in ('ok','unknown','no_results')):
                    provider['reply_source']='model'
                    return {**(last or tools.result('ok',grounded)),'text':grounded,'question':None},provider
                if last is not None:
                    provider.update(reply_source='tools',reason='safe_answer_rejected')
                    return last,provider
                return local('safe_answer_rejected')
            if len(calls)>6 or tools.calls+len(calls)>6:raise ProviderError('bad_response')
            contents.append(content);responses=[]
            for call in calls:
                name,args=call.get('name'),call.get('args',{})
                try:
                    TOOL_INPUTS[name].model_validate(args)
                    # Parsing is evidence for a proposed mutation, not intent routing.
                    patch=parse_patch(text,tools)[0] if name=='update_preferences' else {}
                    permitted=authorized(name,args,text,tools,patch,initial_refs)
                except (ValueError,KeyError,TypeError,AttributeError):permitted=False
                if permitted:
                    last=tools.run(name,args)  # No keyword-derived override of model read arguments.
                    if last['status']=='ok' and name in ('update_preferences','update_foodtour_selection'):
                        last['_mutation_success']=True;last['_operation']=args.get('operation')
                else:
                    last=tools.result('tool_error','Thao tác chưa được cho phép; lựa chọn hiện tại được giữ.',code='authority_denied')
                results.append(last)
                responses.append({'functionResponse':{'id':call['id'],'name':name,'response':tool_projection(last)}})
            contents.append({'role':'user','parts':responses})
        if last is not None:
            provider.update(reply_source='tools',reason='turn_call_cap');return last,provider
        return local('turn_call_cap')
    except (ProviderError,TimeoutError,ValueError,TypeError,KeyError,AttributeError) as error:
        kind=getattr(error,'kind','timeout' if isinstance(error,TimeoutError) else 'bad_response')
        status=getattr(error,'status',None)
        source='provider_http' if type(status) is int else 'local_admission' if getattr(error,'llm_calls',None)==0 else failure_source
        provider['failure']={'kind':kind,'source':source}
        if type(status) is int:provider['failure']['http_status']=status
        if last is not None:
            provider.update(reply_source='tools',reason=kind);return last,provider
        return local(kind)
