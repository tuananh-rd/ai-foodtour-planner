"""Committed green controls only; never let known-red findings kill a mutant."""
from adversarial_guided import *
import importlib
from confirm_u5a2 import mutations
from review_u5d import save

understanding=importlib.import_module('app.chat.understand')
engine_mod=importlib.import_module('app.chat.engine')
from app.llm import safety_parse
from app.chat import coverage
modules=['tests.chat.test_u0_s0','tests.chat.test_u1_guided','tests.chat.test_u5a_blind_safety',
 'tests.chat.test_utterances','tests.chat.test_u5a2_regressions','tests.chat.test_u5c_regressions',
 'tests.chat.test_u5d_review.Controls']
def run():
    suite=unittest.defaultTestLoader.loadTestsFromNames(modules);stream=io.StringIO()
    r=unittest.TextTestRunner(stream=stream,verbosity=0).run(suite)
    return dict(tests_run=r.testsRun,failures=[t.id() for t,_ in r.failures],errors=[t.id() for t,_ in r.errors],test_output=stream.getvalue())

baseline=run();assert not baseline['failures'] and not baseline['errors'],baseline
results=mutations()
for name in ['hypothetical_clause_guard','absent_person_guard','scope_grounding','end_time_grounding',
             'named_absence_guard','hard_avoid_cue','third_party_tracking','hypothetical_clause_splitting',
             'term_before_cue','symptom_cues','dish_scan','dish_negation','final_one_question']:
    with contextlib.ExitStack() as stack:
        if name=='hypothetical_clause_guard':
            method=understanding._understand;source=textwrap.dedent(inspect.getsource(method))
            start=source.index('    if re.search(_HYPO,');end=source.index('    if guided:  # an allergy of someone')
            scope={};exec(compile(source[:start]+source[end:],'<u5d-mutant>','exec'),method.__globals__,scope)
            stack.enter_context(patch.object(understanding,'_understand',scope['_understand']))
        elif name=='absent_person_guard':
            stack.enter_context(patch.object(understanding,'_drop_absent',lambda text:text))
        elif name in ['scope_grounding','end_time_grounding']:
            key='budget_scope' if name=='scope_grounding' else 'end_time'
            method=rewrite(ChatEngine._merge,[('if k not in rules.patch and k in base.patch and not re.search(rx, f):',f'if k != "{key}" and k not in rules.patch and k in base.patch and not re.search(rx, f):')])
            stack.enter_context(patch.object(ChatEngine,'_merge',method))
        elif name=='named_absence_guard':
            method=rewrite(understanding._understand,[('if guided and sp.negated and sp.negated_terms and not sp.allergies:','if False:')])
            stack.enter_context(patch.object(understanding,'_understand',method))
        elif name=='hard_avoid_cue':
            original=safety_parse.parse
            def empty(text):
                sp=original(text);sp.avoid_hard=[];return sp
            stack.enter_context(patch.object(safety_parse,'parse',empty))
        elif name=='third_party_tracking':
            stack.enter_context(patch.object(engine_mod,'is_third_party',lambda text:False))
        elif name=='hypothetical_clause_splitting':
            method=rewrite(understanding._understand,[('(?:còn|nhưng|mà|chứ)','(?:NEVER)')])
            stack.enter_context(patch.object(understanding,'_understand',method))
        elif name=='term_before_cue':
            stack.enter_context(patch.object(safety_parse,'_before_terms',lambda text:[]))
        elif name=='symptom_cues':
            stack.enter_context(patch.object(safety_parse,'_SYMPTOM',re.compile(r'(?!)')))
        elif name=='dish_scan':
            stack.enter_context(patch.object(coverage,'_dish_scan',lambda text:[]))
        elif name=='dish_negation':
            stack.enter_context(patch.object(coverage,'_NEG_BEFORE',set()))
        elif name=='final_one_question':
            stack.enter_context(patch.object(ChatEngine,'_finish',rewrite(ChatEngine._finish,[('if len(cl) > 1:','if False:')])))
        results.append(dict(mutation=name,**run()))
save('mutations',dict(baseline=baseline,mutations=results))
print(json.dumps([dict(mutation=r['mutation'],tests_run=r['tests_run'],failures=len(r['failures']),errors=len(r['errors'])) for r in results]))
