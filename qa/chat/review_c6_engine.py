"""C6 recheck using fresh C6 artifacts; never publishes blind row-level failures."""
import json
import logging
import os
from pathlib import Path
import runpy
import tempfile
from run_scenarios import ROOT, strings, fold

logging.disable(logging.CRITICAL)
# Reuse the independently authored final probe, changing only artifact paths.
source = (ROOT/'qa/chat/review_c1_final.py').read_text(encoding='utf-8')
for old, new in [('C1_FINAL_REPROBE.json','C6_ENGINE_REPROBE.json'),
                 ('C1_FINAL_SCENARIOS.json','C6_SCENARIOS.json'),
                 ('docs/reports/C1_HELDOUT2_API.json', str(Path(os.environ['TEMP'])/'C6_HELDOUT2.json').replace('\\','/')),
                 ('C1_FINAL_HONESTY.json','C6_HONESTY.json')]:
    source = source.replace(old,new)
# Absolute Path after ROOT / remains absolute on Windows.
exec(compile(source,'review_c1_final.py','exec'), {'__name__':'__main__'})
report_path = ROOT/'docs/reports/C6_HONESTY.json'
report = json.loads(report_path.read_text(encoding='utf-8'))
# Look only at aggregate heldout2 evidence in the durable report.
report['hostile_claim_hits'] = [h for h in report['hits'] if h['case'].startswith('hostile')]
reprobe = json.loads((ROOT/'docs/reports/C6_ENGINE_REPROBE.json').read_text(encoding='utf-8'))
report['retry'] = next(r['response'] for r in reprobe['direct'] if r['id']=='retry-call-accounting')
report['heldout_v1'] = {'correct':reprobe['heldout_api_correct'], 'rows':len(reprobe['heldout_api'])}
report['instruction_echoes'] = []
all_blocks = [t['response']['reply']['blocks'] for t in report['hostile_planning']]
all_blocks += [t['response']['reply']['blocks'] for t in reprobe['hostile_fixture']]
for blocks in all_blocks:
    for value in strings(blocks):
        if any(term in fold(value) for term in ('system:', 'ignore instructions','ignore previous','reveal api','1đ/người')):
            report['instruction_echoes'].append(value)
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ('retry','heldout_v1','hostile_claim_hits','instruction_echoes')},ensure_ascii=False))

