"""Offline independent evaluator; stdlib only, synthetic inputs, no provider access."""
import argparse
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.chat.engine import ChatEngine
from app.chat.state import ChatState
from app.data import loader
from app.planner.types import Preferences

SLOTS = ['stops','day_part','budget_vnd','budget_scope','duration_min','max_leg_min',
         'party_size','start_time_set','interests','allergies','allergy_question']


def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s.lower().replace('đ','d'))
                if unicodedata.category(c) != 'Mn')
    return {'lac':'dau phong','dau phung':'dau phong','vung':'me'}.get(s,s)


def new_engine():
    return ChatEngine(loader.load_dataset(ROOT / 'contracts/fixtures/venues.chat.synthetic.json').venues, guided=True)


def load_cases(path=None):
    return [json.loads(s) for s in (path or ROOT/'qa/chat/guided_blind_v1.jsonl').read_text(encoding='utf-8').splitlines() if s]


def observe(r):
    def value(k):
        f = r.state.profile.get(k)
        return f.value if f and f.known() else None
    return dict(stops=value('stops'),day_part=value('day_part'),budget_vnd=value('budget'),
                budget_scope=getattr(r.state.profile.get('budget'),'scope',None),
                duration_min=value('duration_min'),max_leg_min=value('max_leg_min'),
                party_size=value('party_size'),start_time_set=value('start_time') is not None,
                interests=value('tastes') or [],allergies=[a.term for a in r.state.allergies],
                allergy_question=getattr(r.state.pending,'slot',None)=='allergy_term' and r.state.allergy_unresolved)


def safety_failures(case,r,llm_none):
    obs=observe(r); exp=case['expect']; failures=[]
    want={norm(x) for x in exp['allergies']}; got={norm(x) for x in obs['allergies']}
    if want-got: failures.append('allergy_missing')
    if got-want: failures.append('allergy_false_positive')
    if exp['allergy_question'] and not obs['allergy_question']: failures.append('allergy_cue_not_asked')
    if not case.get('prior') and r.plan_request is not None: failures.append('unconfirmed_plan')
    if sum(b['type']=='clarify' for b in r.blocks)>1: failures.append('multiple_clarify')
    if llm_none and r.llm_calls: failures.append('llm_called_when_none')
    return failures


def evaluate(mode='rules', cases=None):
    eng=new_engine(); cases=cases or load_cases(); correct=Counter(); safety=Counter()
    rows=[]; clarifies=0; all_ok=0; safe_ok=0; calls=0; overasking=[]
    def failed_llm(*args):
        if mode=='outcome_exhausted':
            from app.chat.llm_understand import Outcome
            return Outcome(None,0,'exhausted')
        return None
    llm=None if mode=='rules' else failed_llm
    for case in cases:
        st,pr=ChatState(),Preferences()
        try:
            for t in [*case.get('prior',[]),case['text']]:
                r=eng.handle(st,pr,**({'action':t} if isinstance(t,dict) else {'text':t}),llm=llm)
                st,pr=r.state,r.prefs
            obs=observe(r); mismatches={}
            for key in SLOTS:
                want=case['expect'][key]; got=obs[key]
                ok=({norm(x) for x in want}<={norm(x) for x in got} if key=='interests' else
                    {norm(x) for x in want}=={norm(x) for x in got} if key=='allergies' else want==got)
                if ok: correct[key]+=1
                else: mismatches[key]={'expected':want,'actual':got}
            sf=safety_failures(case,r,mode=='rules'); safety.update(sf)
            clar=[b for b in r.blocks if b['type']=='clarify'];clarifies+=len(clar); calls+=r.llm_calls
            slot=getattr(r.state.pending,'slot',None)
            mapping={'budget_scope':'budget_scope','start_time':'start_time_set','allergy_term':'allergies'}
            if slot in mapping and case['expect'][mapping[slot]] not in (None,False,[]):
                overasking.append({'id':case['id'],'slot':slot,'text':case['text']})
            safe_ok+=not sf; all_ok+=not mismatches
            if sf or mismatches:
                rows.append(dict(id=case['id'],text=case['text'],prior=case.get('prior',[]),
                                 safety=sf,mismatches=mismatches,pending=slot))
        except Exception as e:
            safety['exception']+=1
            rows.append(dict(id=case['id'],text=case['text'],safety=['exception'],exception=f'{type(e).__name__}: {e}'))
    n=len(cases)
    summary=dict(mode=mode,cases=n,safety_pass=safe_ok,safety_pct=round(100*safe_ok/n,3),
                 safety_failures=dict(safety),all_slots_correct=all_ok,all_slots_pct=round(100*all_ok/n,3),
                 slot_accuracy_pct={k:round(100*correct[k]/n,3) for k in SLOTS},
                 clarify_per_case=round(clarifies/n,4),llm_calls=calls,overasking_count=len(overasking))
    return dict(summary=summary,failures=rows,overasking=overasking)


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=ROOT/'qa/chat/u5a_first_run.json');args=ap.parse_args()
    if args.output.exists(): raise SystemExit('Refusing to overwrite first-run evidence; choose a new --output')
    results=[evaluate('rules'),evaluate('failed_provider')]
    args.output.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for result in results: print(json.dumps(result['summary'],ensure_ascii=False))
