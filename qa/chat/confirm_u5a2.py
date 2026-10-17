"""Independent offline confirmation probes; never reruns held-out v2."""
import json
from pathlib import Path
from adversarial_guided import *


def hunt():
    texts = [
        'Tôi không bị dị ứng tôm', 'Tôi chưa từng dị ứng tôm', 'Tôi hết dị ứng tôm',
        'Nếu tôi dị ứng trứng thì sao?', 'Nếu tôi dị ứng trứng thì phải tránh gì?',
        'Tôi thích phở, giả sử bạn dị ứng trứng, tôi dị ứng lạc',
        'Bạn tôi dị ứng tôm nhưng không đi cùng',
        'Mẹ tôi dị ứng tôm, còn tôi không bị dị ứng gì',
        'Tôi nói "dị ứng tôm", thực ra tôi dị ứng lạc', '"Tôi dị ứng tôm"',
        'Tôi dị ứng "tôm"', 'Tôi không ăn được phở', 'Tôi không ăn được thịt bò',
        'Tôi không ăn được lạc', 'Tôi ghét trứng', 'Tôi không thích sữa',
        'Tôi bị di ứng tôm', 'Tôi dị ứng tôm và một chất khác',
        'Tôi dị ứng tôm, rồi hẵng tìm quán sau, dị ứng lạc',
        'Tôi dị ứng lạc, đùa thôi là nói về giá, tôi dị ứng tôm thật',
        'Tôi dị ứng lạc nhưng không bị dị ứng tôm',
    ]
    eng = new_engine(); out = []
    for prior in [[], ['Tôi dị ứng lạc']]:
        for text in texts:
            st, pr = ready(eng), Preferences()
            for t in prior + [text]:
                r = eng.handle(st, pr, text=t); st, pr = r.state, r.prefs
            row = dict(prior=prior, text=text, allergies=[a.to_json() for a in st.allergies],
                       unresolved=st.allergy_unresolved, pending=getattr(st.pending, 'slot', None),
                       intent=r.intent, notices=[b.get('code') for b in r.blocks if b.get('code')])
            for action in ['request_plan', 'confirm_yes']:
                r = eng.handle(st, pr, action={'type': action}); st, pr = r.state, r.prefs
            row['plans_after_request_confirm'] = r.plan_request is not None
            out.append(row)
    return out


def grounding():
    eng = new_engine(); out = []
    for text in [
        'Tour 3 quán quanh Hồ Gươm lúc 19h, mình dị ứng mấy thứ rang giòn',
        'Tour 3 quán quanh Hồ Gươm tổng 120 phút ngân sách 500k cho 2 người, mình dị ứng mấy thứ rang giòn',
        'Tour 3 quán quanh Hồ Gươm tối nay, mình dị ứng mấy thứ rang giòn',
    ]:
        llm = lambda *a: Outcome(sanitize({'intent': 'UPDATE_PROFILE', 'patch': {'budget_scope': 'group', 'start_time': '19:00', 'end_time': '21:00', 'interests': ['bún chả'], 'allergy': ['tôm']}}), 1)
        r = eng.handle(ready(eng), Preferences(), text=text, llm=llm)
        row = dict(text=text, calls=r.llm_calls, profile={k:r.state.profile[k].to_json() for k in ['budget', 'start_time', 'end_time', 'tastes']},
                   allergies=[a.to_json() for a in r.state.allergies], pending=getattr(r.state.pending, 'slot', None),
                   understood=[b for b in r.blocks if b['type']=='understood'])
        for action in ['request_plan', 'confirm_yes']:
            r = eng.handle(r.state, r.prefs, action={'type':action})
        row['plans_before_ai_confirmation'] = r.plan_request is not None
        out.append(row)
    return out


def mutations():
    """Run only committed U tests, no corpus scoring, under process-local mutants."""
    from app.llm import safety_parse
    import importlib
    understanding = importlib.import_module('app.chat.understand')
    names = ['allergy_extraction', 'coverage_trigger', 'obligation_gate',
             'ai_allergy_confirmation', 'one_clarify', 'raw_message_safety', 'ai_provenance_grounding']
    results = []
    for name in names:
        with contextlib.ExitStack() as stack:
            if name == 'allergy_extraction':
                original = safety_parse.parse
                def empty(text):
                    sp = original(text); sp.allergies = []; return sp
                stack.enter_context(patch.object(safety_parse, 'parse', empty))
            elif name == 'coverage_trigger':
                from app.chat import coverage
                stack.enter_context(patch.object(coverage, 'trigger', lambda signals: None))
            elif name == 'obligation_gate':
                stack.enter_context(patch.object(ChatEngine, '_open_obligation', lambda self, st: False))
            elif name == 'ai_allergy_confirmation':
                stack.enter_context(patch.object(ChatEngine, '_guided_after', rewrite(ChatEngine._guided_after, [('"ai_unconfirmed"', '"user_said"')])))
            elif name == 'one_clarify':
                stack.enter_context(patch.object(ChatEngine, '_guided_after', rewrite(ChatEngine._guided_after, [('if st.pending is None:', 'if True:')])))
                stack.enter_context(patch.object(ChatEngine, '_guided_continue', rewrite(ChatEngine._guided_continue, [('if st.pending is not None or R.plan_request:', 'if R.plan_request:')])))
            elif name == 'raw_message_safety':
                stack.enter_context(patch.object(understanding, '_understand', rewrite(understanding._understand, [('safety_parse.parse(raw_safety if guided else text)', 'safety_parse.parse(text)')])))
            else:
                source = textwrap.dedent(inspect.getsource(ChatEngine._merge))
                start, end = source.index('    f = fold_uncached(effective_text(text))'), source.index('    conflicts = {}')
                source = source[:start] + source[end:]
                scope = {}; exec(compile(source, '<u5a2-mutant>', 'exec'), ChatEngine._merge.__globals__, scope)
                stack.enter_context(patch.object(ChatEngine, '_merge', scope['_merge']))
            # Freeze the pre-review suite so known newly exposed failures cannot
            # falsely kill a mutant on rerun. These are 55 baseline-green methods.
            if str(ROOT/'backend') not in sys.path:
                sys.path.insert(0, str(ROOT/'backend'))
            suite = unittest.defaultTestLoader.loadTestsFromNames([
                'tests.chat.test_u0_s0', 'tests.chat.test_u1_guided',
                'tests.chat.test_u5a_blind_safety', 'tests.chat.test_utterances',
            ])
            stream = io.StringIO(); result = unittest.TextTestRunner(stream=stream, verbosity=0).run(suite)
            results.append(dict(mutation=name, tests_run=result.testsRun, failures=[t.id() for t,_ in result.failures], errors=[t.id() for t,_ in result.errors], test_output=stream.getvalue()))
    return results


if __name__ == '__main__':
    from app.llm import safety_parse
    mode = sys.argv[1]
    result = hunt() if mode == 'hunt' else grounding() if mode == 'grounding' else mutations()
    p = ROOT / f'qa/chat/u5a2_{mode}.json'
    p.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps(result if mode != 'mutations' else [dict(mutation=x['mutation'], tests_run=x['tests_run'], failures=len(x['failures']), errors=len(x['errors'])) for x in result], ensure_ascii=False))
