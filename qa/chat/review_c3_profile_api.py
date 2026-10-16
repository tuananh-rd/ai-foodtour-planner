"""Replay actual browser-captured profile actions against the offline real API."""
import json
import logging
from run_scenarios import ROOT, scenario_app

logging.disable(logging.CRITICAL)
browser = json.loads((ROOT/'docs/reports/C6_FRONTEND_diagnostics.json').read_text(encoding='utf-8'))
rows = []
with scenario_app({'fixture':'chat','llm':'off'}) as (_, client, _):
    session = client.post('/v1/sessions').json()
    for action in browser['profileActions']:
        response = client.post('/v1/sessions/'+session['session_id']+'/chat',
                               headers={'X-Session-Token':session['token']},
                               json={'revision':0,'action':action})
        rows.append({'action':action,'status':response.status_code,'error':response.json().get('error')})
report = {'synthetic':True,'profile_actions':rows}
(ROOT/'docs/reports/C6_FRONTEND_PROFILE_API.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'statuses':[row['status'] for row in rows]}))
