"""Late-merge guards and additional growth probes, all process-local/offline."""
from review_u5c import *

mutations=[]
module='tests.chat.test_u5c_regressions.GuardControls'
def suite_run():
    stream=io.StringIO()
    r=unittest.TextTestRunner(stream=stream,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromName(module))
    return dict(tests_run=r.testsRun,failures=[t.id() for t,_ in r.failures],errors=[t.id() for t,_ in r.errors],test_output=stream.getvalue())
baseline=suite_run()
assert not baseline['failures'] and not baseline['errors'],baseline
for name,site in [('model_symptom_guard',' and not SYMPTOM_WORDS & set(t.casefold().split())'),
                  ('model_concrete_guard',' and self._concrete(t)')]:
    with patch.object(ChatEngine,'_merge',rewrite(ChatEngine._merge,[(site,'')])):
        mutations.append(dict(mutation=name,**suite_run()))
eng=new_engine();st=ready(eng);pr=Preferences()
st.allergies=[Allergy('tôm')]
st.last_results=[{'label':'A','venue_id':eng.venues[0].id}]
for _ in range(1000):
    r=eng.handle(st,pr,text='Tôi đã gọi quán A, quán nói có tôm')
    st,pr=r.state,r.prefs
growth=dict(confirmation_entries=len(st.allergies[0].venue_confirmations),
            persisted_entries=len(ChatState.from_json(st.to_json(private=True)).allergies[0].venue_confirmations),
            turns=len(st.turns),state_bytes=len(json.dumps(st.to_json(private=True)).encode('utf8')))
st,pr=ChatState(),Preferences()
st=eng.handle(st,pr,text='Tìm phở').state
for _ in range(1000):
    r=eng.handle(st,pr,text='zqxw');st,pr=r.state,r.prefs
nudge_growth={k:len(getattr(st,k)) for k in ['turns','asked','conflicts','allergies','shortlist']}
save('extra_review',dict(mutation_baseline=baseline,mutations=mutations,confirmation_growth=growth,nudge_growth=nudge_growth))
print(json.dumps(dict(mutations=[dict(name=r['mutation'],failures=r['failures'],errors=r['errors']) for r in mutations],confirmation_growth=growth,nudge_growth=nudge_growth)))
