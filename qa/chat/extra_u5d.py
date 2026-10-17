"""Supplemental prior model-guard mutations and persistent-state bounds."""
from adversarial_guided import *
from review_u5d import save

def controls():
    stream=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromName('tests.chat.test_u5c_regressions.GuardControls')
    r=unittest.TextTestRunner(stream=stream,verbosity=0).run(suite)
    return dict(tests_run=r.testsRun,failures=[t.id() for t,_ in r.failures],errors=[t.id() for t,_ in r.errors],test_output=stream.getvalue())
base=controls();assert not base['failures'] and not base['errors']
mutants=[]
for name,site in [('model_symptom_guard',' and not SYMPTOM_WORDS & set(t.casefold().split())'),('model_concrete_guard',' and self._concrete(t)')]:
    with patch.object(ChatEngine,'_merge',rewrite(ChatEngine._merge,[(site,'')])):
        mutants.append(dict(mutation=name,**controls()))
eng=new_engine();st=ready(eng);pr=Preferences();st.allergies=[Allergy('tôm')]
st.last_results=[{'label':'A','venue_id':eng.venues[0].id}]
for i in range(1000):
    r=eng.handle(st,pr,text='Tôi đã gọi quán A, quán nói có tôm');st,pr=r.state,r.prefs
confirmations=dict(live=len(st.allergies[0].venue_confirmations),persisted=len(ChatState.from_json(st.to_json(private=True)).allergies[0].venue_confirmations))
st=ChatState();pr=Preferences();st=eng.handle(st,pr,text='Tìm phở').state
for _ in range(1000):
    r=eng.handle(st,pr,text='zqxw');st,pr=r.state,r.prefs
nudge={k:len(getattr(st,k)) for k in ['turns','asked','conflicts','allergies','shortlist']}
save('extra',dict(baseline=base,mutations=mutants,confirmations=confirmations,nudge_1000=nudge))
print(json.dumps(dict(mutations=[dict(name=r['mutation'],failures=r['failures'],errors=r['errors']) for r in mutants],confirmations=confirmations,nudge=nudge)))
