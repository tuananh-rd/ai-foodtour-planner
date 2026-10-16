"""Offline held-out API evaluation, fresh session and public setup actions per row."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
from run_scenarios import ROOT, run_scenario, fold


def evaluate_rows(path):
    rows = [json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    seen = set()
    confusion = defaultdict(Counter)
    results = []
    for row in rows:
        assert row['id'] not in seen, 'Duplicate row id'
        seen.add(row['id'])
        turns = [({'say':a['say']} if 'say' in a else {'action':a}) for a in row['setup_actions']]
        turns.append({'say':row['text']})
        result = run_scenario({'id':row['id'],'setup':{'fixture':'chat','llm':'off'},'turns':turns})
        previous = result['turns'][-2]['response']['chat'] if len(turns)>1 else {'pending':None,'last_results':[]}
        pending = previous['pending']
        context = {'pending':dict(pending,slot=pending.get('slot')) if pending else None,
                   'last_results':previous['last_results']}
        if context != row['context']:
            result['status'] = 'failed'
            result['context_error'] = 'Public setup no longer matches the frozen context'
        actual = result['turns'][-1]['intent']
        confusion[row['intent']][actual] += 1
        result.update(expected=row['intent'],actual=actual,correct=actual==row['intent'])
        results.append(result)
    correct = sum(r['correct'] for r in results)
    return {'corpus_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':len(rows),'correct':correct,
            'accuracy':correct/len(rows) if rows else 0,'invariant_failures':sum(r['status']!='passed' for r in results),
            'confusion':{k:dict(v) for k,v in sorted(confusion.items())},'results':results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,default=ROOT/'qa/chat/heldout2.jsonl')
    parser.add_argument('--report',type=Path)
    args = parser.parse_args()
    report = evaluate_rows(args.corpus)
    print(f"API accuracy: {report['correct']}/{report['rows']} = {report['accuracy']:.2%}")
    print(f"Invariant/setup failures: {report['invariant_failures']}")
    print('Expected | Actual: count')
    for expected, counts in report['confusion'].items():
        print(expected+' | '+', '.join(f'{actual}: {count}' for actual,count in sorted(counts.items(),key=lambda kv:str(kv[0]))))
    if args.report:
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0 if report['rows']>=80 and report['accuracy']>=.85 and not report['invariant_failures'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
