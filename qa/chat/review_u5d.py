"""Offline post-freeze diagnostics. Does not rescore or modify engine/corpus."""
from adversarial_guided import *
import importlib
import re

def save(name,obj):
    p=ROOT/f'qa/chat/u5d_{name}.json'
    assert not p.exists(),p
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

def diagnostics():
    eng=new_engine(); rows=[]
    failures=json.loads((ROOT/'qa/chat/u5d_first_run.json').read_text(encoding='utf8'))[0]['failures']
    for case in failures:
        if not case['safety']: continue
        st,pr=ready(eng),Preferences();trace=[]
        for entry in [*({'text':t} if isinstance(t,str) else {'action':t} for t in case.get('prior',[])),{'text':case['text']},{'action':{'type':'request_plan'}},{'action':{'type':'confirm_yes'}}]:
            r=eng.handle(st,pr,**entry);st,pr=r.state,r.prefs
            trace.append(dict(input=entry,intent=r.intent,allergies=[a.to_json() for a in st.allergies],
                unresolved=st.allergy_unresolved,pending=st.pending.to_json() if st.pending else None,
                phase=st.phase,plan_request=r.plan_request))
        rows.append(dict(id=case['id'],trace=trace))
    # Person identity and party membership across messages.
    identities=[]
    for texts in [
        ['Con tôi dị ứng vừng, cháu đi cùng.', 'Đồng nghiệp tôi không đi.'],
        ['Bạn tôi dị ứng tôm.', 'Con tôi dị ứng sữa.', 'Bạn tôi không đi cùng.'],
        ['Con tôi dị ứng vừng. Ông bà không đi.'],
        ['Mẹ tôi dị ứng tôm. Con tôi dị ứng sữa. Mẹ tôi không đi.'],
        ['Con tôi dị ứng vừng.', 'Ông tôi không đi.'],
        ['Tôi dị ứng vừng.', 'Bạn tôi dị ứng tôm.', 'Bạn tôi không đi.'],
    ]:
        st,pr=ready(eng),Preferences();trace=[]
        for t in texts:
            r=eng.handle(st,pr,text=t);st,pr=r.state,r.prefs
            trace.append(dict(text=t,allergies=[a.to_json() for a in st.allergies],unresolved=st.allergy_unresolved))
        for a in ['request_plan','confirm_yes']:
            r=eng.handle(st,pr,action={'type':a});st,pr=r.state,r.prefs
        identities.append(dict(trace=trace,plan_request=r.plan_request,phase=st.phase))
    st=ready(eng);st.set_field('tastes',['PRIVATE_NAME_SENTINEL']);st.remember('user','PRIVATE_TEXT_SENTINEL');st.allergies=[Allergy('PRIVATE_ALLERGY_SENTINEL')]
    compact=eng.compact(st)
    growth=ChatState();pr=Preferences()
    for i in range(2000):
        r=eng.handle(growth,pr,text='Mình dị ứng vừng.' if i%2 else 'qzxw');growth,pr=r.state,r.prefs
    from confirm_u5a2 import grounding
    save('review',dict(failure_followups=rows,identity_probes=identities,compact=compact,
        compact_sentinel_leak='PRIVATE_' in json.dumps(compact),
        growth_2000={k:len(getattr(growth,k)) for k in ['turns','asked','conflicts','allergies','shortlist']},grounding=grounding()))
    print('review saved; ready-state plans:',sum(bool(x['trace'][-1]['plan_request']) for x in rows))

def timing():
    # Capture runtime patterns with actual assembled strings, not approximations
    # of concatenated constants. Exercise every frozen utterance plus branches.
    patterns={}; originals={k:getattr(re,k) for k in ['search','match','fullmatch','finditer','findall','split','sub','compile']}
    def wrapper(name):
        def call(pattern,*args,**kw):
            if isinstance(pattern,str):
                flags=kw.get('flags',0)
                # Search-family flags are argument two; sub/split have count/maxsplit first.
                pos=2 if name in ['sub','split'] else 1
                if len(args)>pos: flags=args[pos]
                if name=='compile' and args: flags=args[0]
                patterns[(pattern,int(flags))]=True
            return originals[name](pattern,*args,**kw)
        return call
    from app.chat import coverage
    from app.llm import safety_parse
    understanding=importlib.import_module('app.chat.understand')
    with contextlib.ExitStack() as stack:
        for name in originals: stack.enter_context(patch.object(re,name,wrapper(name)))
        eng=new_engine()
        for c in load_cases(ROOT/'qa/chat/guided_blind_v4.jsonl'):
            eng.handle(ChatState(),Preferences(),text=c['text'])
        for text in ['Bạn tôi không đi cùng','Tôi dị ứng tôm nhưng bạn tôi không đi','Nếu tôi dị ứng trứng thì phải tránh gì?','Tôi không bị dị ứng tôm','Tôi kiêng trứng']:
            eng.handle(ready(eng),Preferences(),text=text)
    # Module-level compiled patterns are not calls through re.* at runtime.
    for mod in [coverage,safety_parse,understanding]:
        for val in vars(mod).values():
            if isinstance(val,re.Pattern): patterns[(val.pattern,val.flags)]=True
    samples=['a','dị ứng ','bạn tôi không đi ','nếu tôi dị ứng ','không ăn được ','999999 ','<','tôi thích ','tôm còn ',' ']
    table=[]
    for (pat,flags) in patterns:
        rx=re.compile(pat,flags); row=dict(pattern=pat,flags=flags,times=[])
        for n in [250,500,1000,2000]:
            worst=0;prefix=''
            for cue in samples:
                text=(cue*(n+1))[:n]
                start=time.perf_counter();list(rx.finditer(text));ms=(time.perf_counter()-start)*1000
                if ms>worst: worst,prefix=ms,cue
            row['times'].append(dict(chars=n,max_ms=round(worst,4),worst_prefix=prefix))
        table.append(row)
    engine=[];eng=new_engine()
    for cue in samples:
        for n in [250,500,1000,2000]:
            text=(cue*(n+1))[:n];ms=[]
            for _ in range(3):
                start=time.perf_counter();eng.handle(ChatState(),Preferences(),text=text);ms.append((time.perf_counter()-start)*1000)
            engine.append(dict(prefix=cue,chars=n,median_ms=round(statistics.median(ms),4),max_ms=round(max(ms),4)))
    save('timing',dict(method='All captured runtime and module-level regexes; finditer forces full scan; ten adversarial families per length; superset of new regexes',regexes=table,engine=engine))
    print('timed',len(table),'regexes')

if __name__=='__main__':
    mode=sys.argv[1]
    if mode in ['raw','valid','mixed']:
        r=fuzz(seed=5172026,sequences=3000,valid_actions=mode!='raw',fake_provider=mode=='mixed');save('fuzz_'+mode,r);print(json.dumps({k:v for k,v in r.items() if k!='failures'}))
    elif mode=='review': diagnostics()
    elif mode=='timing': timing()
