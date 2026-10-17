"""Offline review evidence; never evaluates the frozen corpus again."""
import argparse
import importlib
import json
import sys
from pathlib import Path

from adversarial_guided import *
from confirm_u5a2 import mutations as original_mutations


def save(name, obj):
    path = ROOT / f'qa/chat/u5c_{name}.json'
    assert not path.exists(), path
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


def run_fuzz(mode):
    result = fuzz(seed=5172026, sequences=3000, valid_actions=mode!='raw', fake_provider=mode=='mixed')
    save('fuzz_'+mode, result)
    print(json.dumps({k:v for k,v in result.items() if k!='failures'},ensure_ascii=False))


def run_mutations():
    results = original_mutations()
    understanding = importlib.import_module('app.chat.understand')
    from app.llm import safety_parse
    # Tests are all committed before mutation execution. Newly exposed failing
    # regressions are intentionally excluded so they cannot falsely kill mutants.
    modules = ['tests.chat.test_u0_s0', 'tests.chat.test_u1_guided',
               'tests.chat.test_u5a_blind_safety', 'tests.chat.test_utterances',
               'tests.chat.test_u5a2_regressions', 'tests.chat.test_u5c_regressions.GuardControls']
    def run():
        suite = unittest.defaultTestLoader.loadTestsFromNames(modules)
        stream = io.StringIO()
        r = unittest.TextTestRunner(stream=stream,verbosity=0).run(suite)
        return dict(tests_run=r.testsRun, failures=[t.id() for t,_ in r.failures],
                    errors=[t.id() for t,_ in r.errors], test_output=stream.getvalue())
    baseline = run()
    assert not baseline['failures'] and not baseline['errors'], baseline
    for name in ['hypothetical_clause_guard','absent_person_guard','scope_grounding',
                 'end_time_grounding','named_absence_guard','hard_avoid_cue']:
        with contextlib.ExitStack() as stack:
            if name in ['hypothetical_clause_guard','absent_person_guard','named_absence_guard']:
                method = understanding._understand
                source = textwrap.dedent(inspect.getsource(method))
                if name == 'hypothetical_clause_guard':
                    start = source.index('    if re.search(r"như thể')
                    end = source.index('    if guided:  # an allergy of someone')
                    source = source[:start]+source[end:]
                elif name == 'absent_person_guard':
                    start = source.index('    if guided:  # an allergy of someone')
                    end = source.index('    raw_safety = text')
                    source = source[:start]+source[end:]
                else:
                    source = source.replace('if guided and sp.negated and sp.negated_terms and not sp.allergies:',
                                            'if False:')
                scope = {}
                exec(compile(source,'<u5c-mutant>','exec'),method.__globals__,scope)
                stack.enter_context(patch.object(understanding,'_understand',scope['_understand']))
            elif name in ['scope_grounding','end_time_grounding']:
                key = 'budget_scope' if name == 'scope_grounding' else 'end_time'
                method = rewrite(ChatEngine._merge,[
                    ('if k not in rules.patch and k in base.patch and not re.search(rx, f):',
                     f'if k != "{key}" and k not in rules.patch and k in base.patch and not re.search(rx, f):')])
                stack.enter_context(patch.object(ChatEngine,'_merge',method))
            else:
                original = safety_parse.parse
                def empty_hard(text):
                    sp = original(text); sp.avoid_hard = []; return sp
                stack.enter_context(patch.object(safety_parse,'parse',empty_hard))
            result = dict(mutation=name,**run())
            results.append(result)
    save('mutations',dict(baseline=baseline,mutations=results))
    print(json.dumps([dict(mutation=r['mutation'],tests_run=r['tests_run'],failures=len(r['failures']),errors=len(r['errors'])) for r in results]))


def review():
    eng = new_engine()
    # Repro steps are diagnostic followups, not a second corpus score.
    cases = json.loads((ROOT/'qa/chat/u5c_first_run.json').read_text(encoding='utf8'))[0]['failures']
    rows=[]
    for c in cases:
        if not c['safety']:
            continue
        st,pr=ready(eng),Preferences()
        trace=[]
        for entry in [*({'text':t} for t in c.get('prior',[])), {'text':c['text']},
                      {'action':{'type':'request_plan'}},{'action':{'type':'confirm_yes'}}]:
            r=eng.handle(st,pr,**entry)
            trace.append(dict(input=entry,intent=r.intent,allergies=[a.term for a in r.state.allergies],
                              unresolved=r.state.allergy_unresolved,pending=r.state.pending.to_json() if r.state.pending else None,
                              plan_request=r.plan_request,clarifies=sum(b['type']=='clarify' for b in r.blocks)))
            st,pr=r.state,r.prefs
        rows.append(dict(id=c['id'],trace=trace))
    grounded=[]
    for text in [
        'Tour 3 quán khoảng 1 tiếng rưỡi, mình dị ứng mấy thứ rang giòn',
        'Tour 3 quán tối nay 120 phút cho một người, ngân sách 500k, mình dị ứng mấy thứ rang giòn',
        'Tour 3 quán tối nay 120 phút, chung sở thích phở, ngân sách 500k cho 2 người, mình dị ứng mấy thứ rang giòn',
    ]:
        llm=lambda *a:Outcome(sanitize({'intent':'UPDATE_PROFILE','patch':{'start_time':'19:00','end_time':'21:00','budget_scope':'group'}}),1)
        r=eng.handle(ChatState(),Preferences(),text=text,llm=llm)
        grounded.append(dict(text=text,calls=r.llm_calls,profile={k:r.state.profile[k].to_json() for k in ['start_time','end_time','budget']}))
    # Exactly 1000 characters including adversarial trigger and no punctuation.
    timing=[]
    templates=['a','dị ứng ','tôi thích ','nếu tôi ','tôm nhưng không ','12 h ','<','(', 'không ăn được ']
    for prefix in templates:
        text=(prefix*1001)[:1000]
        samples=[]
        for _ in range(30):
            start=time.perf_counter();eng.handle(ChatState(),Preferences(),text=text)
            samples.append((time.perf_counter()-start)*1000)
        timing.append(dict(prefix=prefix,chars=len(text),max_ms=round(max(samples),4),median_ms=round(statistics.median(samples),4)))
    st=ready(eng);st.set_field('tastes',['PRIVATE_NAME_SENTINEL'])
    st.remember('user','PRIVATE_TEXT_SENTINEL');st.allergies=[Allergy('PRIVATE_ALLERGY_SENTINEL')]
    compact=eng.compact(st)
    growth=ChatState();pr=Preferences()
    for _ in range(1000):
        r=eng.handle(growth,pr,text='Mình dị ứng lạc');growth,pr=r.state,r.prefs
        r=eng.handle(growth,pr,text='zqxw');growth,pr=r.state,r.prefs
    return dict(failure_followups=rows,grounding=grounded,timing_1000=timing,compact=compact,
                compact_sentinel_leak='PRIVATE_' in json.dumps(compact),
                growth_2000={k:len(getattr(growth,k)) for k in ['turns','asked','conflicts','allergies','shortlist']})


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('mode',choices=['raw','valid','mixed','mutations','review']);args=ap.parse_args()
    if args.mode in ['raw','valid','mixed']: run_fuzz(args.mode)
    elif args.mode=='mutations': run_mutations()
    else:
        result=review();save('review',result)
        print(json.dumps({k:v for k,v in result.items() if k!='failure_followups'},ensure_ascii=False))
