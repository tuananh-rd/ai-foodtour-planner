"""Independent final-gate probes. Only synthetic input; counts-only secret scan."""
import io
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
os.environ.update(FOODTOUR_CHAT_V2='1', FOODTOUR_LLM='mock', FOODTOUR_EXPLAIN='template', FOODTOUR_DATA_PATH=str(ROOT/'contracts/fixtures/venues.chat.synthetic.json'), FOODTOUR_ROUTING='estimate', FOODTOUR_GEOCODER='off', FOODTOUR_RATE_LIMIT_TOKEN='10000', FOODTOUR_RATE_LIMIT_IP='10000')
from fastapi.testclient import TestClient

with tempfile.TemporaryDirectory() as tmp:
    os.environ['FOODTOUR_SESSION_DB'] = str(Path(tmp)/'sessions.sqlite')
    from app.main import create_app
    with TestClient(create_app(data_path=ROOT/'contracts/fixtures/venues.chat.synthetic.json')) as client:
        a,b=[client.post('/v1/sessions').json() for _ in range(2)]
        url='/v1/sessions/'+b['session_id']
        h={'X-Session-Token':b['token']}
        print('isolation',client.post(url+'/chat',headers={'X-Session-Token':a['token']},json={'revision':0,'text':'hello'}).status_code)
        log=io.StringIO(); handler=logging.StreamHandler(log);logging.getLogger('foodtour.access').addHandler(handler)
        sentinel='SYNTHETIC_PRIVATE_CHAT_MARKER'
        response=client.post(url+'/chat',headers=h,json={'revision':0,'text':sentinel})
        logging.getLogger('foodtour.access').removeHandler(handler)
        print('logs',{'records':len(log.getvalue().splitlines()),'user_text_occurrences':log.getvalue().count(sentinel),'token_occurrences':log.getvalue().count(b['token'])})
        rev=response.json()['revision']
        for label,payload in [('party',{'action':{'type':'edit_profile','patch':{'party_size':3}}}),('per_person_budget',{'action':{'type':'edit_profile','patch':{'budget_vnd':250000,'budget_scope':'per_person'}}}),('allergy_editor',{'text':'dị ứng cua'}),('taste_editor',{'text':'tôi muốn ăn ít cay'})]:
            r=client.post(url+'/chat',headers=h,json={'revision':rev,**payload})
            print('corrected_editor',label,r.status_code)
            if r.status_code==200:
                rev=r.json()['revision']
                if label=='allergy_editor':print('allergy_recorded',any(x['term']=='cua' for x in r.json()['chat']['allergies']))
                if label=='taste_editor':print('taste_recorded',r.json()['chat']['profile']['tastes']['value'])
        for label,payload in [('budget_total',{'action':{'type':'edit_profile','patch':{'budget_vnd':600000,'budget_scope':'total'}}}),('walking',{'action':{'type':'edit_profile','patch':{'vehicle':'walking'}}}),('replace',{'action':{'type':'replace_stop','venue_id':'SYNTHETIC','order':1,'text':'đổi quán thứ 1'}}),('oversize',{'text':'x'*1001}),('json_state_injection',{'text':'hello','chat':{'phase':'planned'}}),('sql',{'text':"'; DROP TABLE sessions; --"})]:
            r=client.post(url+'/chat',headers=h,json={'revision':rev,**payload});print(label,r.status_code)
            if r.status_code==200:rev=r.json()['revision']
        print('state_intact',client.get(url,headers=h).status_code)
        os.environ.pop('FOODTOUR_CHAT_V2')
        print('flag_off',{'chat':client.post(url+'/chat',headers=h,json={'revision':rev,'text':'hello'}).status_code,'feature':client.get('/v1/client-config').json()['features']['chat_v2']})

files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
files=[f for f in files if f]
patterns={'google_api_keys':r'AIza[0-9A-Za-z_-]{35}', 'openai_keys':r'sk-(?:proj-)?[A-Za-z0-9_-]{30,}', 'private_key_headers':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', 'foody_venue_url_reference_files':r'https?://(www\.)?foody\.vn/(ha-noi|ho-chi-minh)/', 'csv_row_header_reference_files':r'(^|,)(RestaurantId|RestaurantName|restaurant_id),'}
counts={}
for label,pattern in patterns.items():
    result=subprocess.run(['git','grep','-I','-l','-E',pattern,'--','.'],cwd=ROOT,capture_output=True)
    counts[label]=len(result.stdout.splitlines())
counts['tracked_env_files']=sum(Path(f).name=='.env' or Path(f).name.startswith('.env.') and not f.endswith('.example') for f in files)
counts['tracked_csv']=sum(f.lower().endswith('.csv') for f in files)
counts['tracked_private_dataset_names']=sum(bool(re.search(r'restaurants(?:_enriched)?|foody.*\.(csv|json)',f,re.I)) for f in files)
foody_candidates=subprocess.run(['git','grep','-I','-l','-E',patterns['foody_venue_url_reference_files'],'--','.'],cwd=ROOT,capture_output=True).stdout.decode().splitlines()
counts['unlabeled_foody_venue_row_candidates']=0
counts['candidate_report_csv_references']=0
def inspect_report(value):
    if isinstance(value,dict):
        direct_url=any(isinstance(v,str) and re.search(patterns['foody_venue_url_reference_files'],v) for v in value.values())
        name=value.get('name') or value.get('venue_name')
        if direct_url and isinstance(name,str) and 'synthetic' not in name.lower() and set(value)&{'lat','lon','latitude','longitude'}:
            counts['unlabeled_foody_venue_row_candidates']+=1
        for child in value.values():inspect_report(child)
    elif isinstance(value,list):
        for child in value:inspect_report(child)
    elif isinstance(value,str) and re.search(r'\.csv\b',value):
        counts['candidate_report_csv_references']+=1
for candidate in foody_candidates:
    if candidate.startswith('docs/') and candidate.endswith('.json'):
        inspect_report(json.loads((ROOT/candidate).read_text(encoding='utf-8')))
print('tree_scan_counts',json.dumps(counts,sort_keys=True))
