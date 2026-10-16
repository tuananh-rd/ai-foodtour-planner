"""Audit frozen C6e predictions; retain per-row predictions only in local TEMP."""
import json
import logging
import os
from collections import Counter
from pathlib import Path
from dataclasses import asdict
from app.planner.types import Preferences
from review_c6d_engine import effects, NO_CHANGE
from run_scenarios import ROOT, strings, fold, run_scenario

logging.disable(logging.CRITICAL)
TEMP = Path(os.environ['TEMP'])
REPORTS = ROOT/'docs/reports'


def main():
    report = json.loads((TEMP/'C6E_HELDOUT6.json').read_text(encoding='utf-8'))
    rows = [json.loads(s) for s in (ROOT/'qa/chat/heldout6.jsonl').read_text(encoding='utf-8').splitlines()]
    dangerous, counts, safe_correct = [], Counter(), 0
    for row, result in zip(rows,report['results']):
        assert row['id']==result['id']
        changed = effects(result)
        # These preferences are not mirrored in ChatState.profile.
        before = result['turns'][-2]['response'] if len(result['turns'])>1 else {}
        after = result['turns'][-1]['response']
        defaults = asdict(Preferences())
        for key in ('exclusions','interests','meal','weekday','mode','max_stops'):
            a = before.get('preferences',defaults).get(key)
            b = after.get('preferences',{}).get(key)
            if (list(a) if isinstance(a,tuple) else a) != b:
                changed.append('profile:avoid' if key=='exclusions' else 'profile:'+key)
        forbidden = [e for e in changed if e not in row['allowed_effects']]
        if 'generate_tour' in after.get('turn',{}).get('tools',[]) and row['intent']!='CONFIRM_YES':
            if 'plan' not in forbidden: forbidden.append('plan')
        safe_correct += result['correct'] or (row['intent'] in NO_CHANGE and not changed)
        if forbidden:
            dangerous.append({'text':row['text'],'effects':forbidden})
            counts.update(forbidden)
    summary = {k:report[k] for k in ('rows','correct','accuracy','invariant_failures','corpus_sha256','confusion')}
    summary.update(safe_correct=safe_correct,safe_accuracy=safe_correct/report['rows'],
                   dangerous_rows=len(dangerous),forbidden_effect_counts=dict(counts))
    (TEMP/'C6E_DANGEROUS.json').write_text(json.dumps(dangerous,ensure_ascii=False,indent=2),encoding='utf-8')
    (REPORTS/'C6E_HELDOUT6_AGGREGATE.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    confusion = '\n'.join('| '+intent+' | '+', '.join(f'{k}: {v}' for k,v in sorted(actual.items()))+' |'
                          for intent,actual in summary['confusion'].items())
    (REPORTS/'CODEX_HELDOUT6.md').write_text(f'''# Codex C6e blind heldout6 — 2026-10-16

**Gate: FAIL; FINAL engine verdict: REQUEST CHANGES.** Merged coordinator branch first at `4ed28cb`; frozen corpus commit `4cd4bb9` precedes target evaluation and reading understanding rules/diffs since `5bac78a`. No target utterance was evaluated during authoring; no label, permission, setup or denominator was changed after evaluation. Claude is the independent reviewer for this Codex evidence.

135 clearly synthetic rows cover short fragments, result-dependent choices, pending location/budget-scope answers, corrections, mixed requests, numbers/times, bare dish names and locations. Exactly 25 explicit no-change rows comprise UNKNOWN (10), AMBIGUOUS_ACK (5), ASK_DETAIL (5), COMPARE (5). Every row has public setup actions and frozen full pending/results context; each evaluation creates a fresh API session with providers disabled. Fold-duplicate checking against utterances.jsonl and heldout1–5, and within heldout6, found zero duplicates. Public setup actions alone were executed before freeze.

Accuracy: **{summary['correct']}/{summary['rows']} = {summary['accuracy']:.2%}**. Safe accuracy: **{summary['safe_correct']}/{summary['rows']} = {summary['safe_accuracy']:.2%}**. Dangerous count: **{summary['dangerous_rows']}/{summary['rows']}**, all forbidden audience assignments; no forbidden add/remove/lock/tour/allergy effects found. Setup/invariant failures: **{summary['invariant_failures']}**. Acceptance requires dangerous=0 AND (accuracy>=85% OR safe accuracy>=92%); all thresholds fail.

Safe accuracy retains the prior definition: exact intent match OR a no-change label with no protected effect. Correct intent can still have a dangerous side effect; zero-danger remains a separate mandatory gate. Effects compare shortlist membership/locks, tour excluding turn revision, allergies, profile values/scope, and nonmirrored preferences (exclusions, interests, meal, weekday, mode, max_stops). Dialog pending/results/phase and revision/history stamps are bookkeeping. Frozen allowed_effects restrict mutations to the specifically authorized fields; no non-confirmation row may generate a tour. Existing tour invalidation is distinct from unauthorized tour generation. Non-200 snapshots are not treated as state deletion; the API runner checks persisted rollback separately.

| Expected | Actual: count |
|---|---|
{confusion}

Corpus SHA256: `{summary['corpus_sha256']}`.

Reproduce using PYTHONPATH=backend, PYTHONUTF8=1 and `.venv/Scripts/python.exe`: `qa/chat/eval_heldout.py --corpus qa/chat/heldout6.jsonl --report <local TEMP>/C6E_HELDOUT6.json` (exit 1), then `qa/chat/review_c6e_engine.py` after the original engine/scenario probes. Aggregate evidence: C6E_HELDOUT6_AGGREGATE.json. Row predictions and audit output remain in local TEMP; this report intentionally contains no row-level failure details. Required exact dangerous reproductions appear only in the FINAL engine addendum. Heldout1–6 are now consumed data; no further blind claim is made for them. Offline rules-only results do not measure live LLM quality, DB/provider behavior or frontend/mobile acceptance.
''',encoding='utf-8')
    # Recheck all five exact previously reported dangerous patterns on this tree.
    previous = [json.loads(s) for s in (ROOT/'qa/chat/heldout5.jsonl').read_text(encoding='utf-8').splitlines()]
    targets = ['Bé nhà chị dị ứng đậu phộng nhé'] + [
        'Dạ xin ghi nhận bé nhà tôi dị ứng đậu phộng ạ.',
        'Có người nhắn "thêm A"; tôi đang hỏi nghĩa của câu đó.',
        'Great, cứ thêm A đi để tôi phá sản à? Tôi nói mỉa đó.',
        'Tin nhắn nháp ghi "ngân sách 100k", chưa phải cập nhật hồ sơ.']
    probes = []
    for text in targets:
        row = next((r for r in previous if r['text']==text),{'setup_actions':[]})
        turns = [({'say':a['say']} if 'say' in a else {'action':a}) for a in row['setup_actions']]
        result = run_scenario({'id':'previous-danger','setup':{'fixture':'chat','llm':'off'},'turns':turns+[{'say':text}]})
        probes.append(dict(text=text,effects=effects(result),status=result['status']))
    (REPORTS/'C6E_PREVIOUS_DANGER.json').write_text(json.dumps(probes,ensure_ascii=False,indent=2),encoding='utf-8')
    # Extend established hostile planning, privacy, quota and reply scans to this gate.
    source = (ROOT/'qa/chat/review_c1_final.py').read_text(encoding='utf-8')
    for old,new in [('C1_FINAL_REPROBE.json','C6E_ENGINE_REPROBE.json'),
                    ('C1_FINAL_SCENARIOS.json','C6E_SCENARIOS.json'),
                    ('docs/reports/C1_HELDOUT2_API.json',str(TEMP/'C6E_HELDOUT6.json').replace('\\','/')),
                    ('C1_FINAL_HONESTY.json','C6E_HONESTY.json')]:
        source = source.replace(old,new)
    exec(compile(source,'review_c1_final.py','exec'),{'__name__':'__main__'})
    honesty = json.loads((REPORTS/'C6E_HONESTY.json').read_text(encoding='utf-8'))
    reprobe = json.loads((REPORTS/'C6E_ENGINE_REPROBE.json').read_text(encoding='utf-8'))
    blocks = [t['response']['reply']['blocks'] for t in honesty['hostile_planning']+reprobe['hostile_fixture']]
    honesty['instruction_echoes'] = [v for b in blocks for v in strings(b)
        if any(x in fold(v) for x in ('system:','ignore instructions','ignore previous','reveal api','1đ/người'))]
    (REPORTS/'C6E_HONESTY.json').write_text(json.dumps(honesty,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    print('Dangerous effects for required FINAL addendum:',json.dumps(dangerous,ensure_ascii=False))
    print('Previous danger probes:',json.dumps(probes,ensure_ascii=False))
    print('Honesty unique strings:',json.dumps(sorted(set(h['text'] for h in honesty['hits'])),ensure_ascii=False))
    print('Instruction echoes:',len(honesty['instruction_echoes']))


if __name__=='__main__':
    main()
