"""C6-final-2 synthetic API checks and counts-only tracked/history scan."""
import io
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
os.environ.update(FOODTOUR_CHAT_V2='1', FOODTOUR_LLM='mock', FOODTOUR_EXPLAIN='template',
    FOODTOUR_DATA_PATH=str(ROOT/'contracts/fixtures/venues.chat.synthetic.json'),
    FOODTOUR_ROUTING='estimate', FOODTOUR_GEOCODER='off',
    FOODTOUR_RATE_LIMIT_TOKEN='10000', FOODTOUR_RATE_LIMIT_IP='10000')
from fastapi.testclient import TestClient
from app.main import create_app

with tempfile.TemporaryDirectory() as tmp:
    os.environ['FOODTOUR_SESSION_DB'] = str(Path(tmp)/'sessions.sqlite')
    with TestClient(create_app(data_path=os.environ['FOODTOUR_DATA_PATH'])) as client:
        a, b = [client.post('/v1/sessions').json() for _ in range(2)]
        url = '/v1/sessions/'+b['session_id']
        headers = {'X-Session-Token':b['token']}
        status = client.post(url+'/chat',headers={'X-Session-Token':a['token']},json={'revision':0,'text':'hello'}).status_code
        assert status == 403
        print('session_isolation',status)
        stream=io.StringIO(); handler=logging.StreamHandler(stream)
        logger=logging.getLogger('foodtour.access'); logger.addHandler(handler)
        marker='SYNTHETIC_C6_FINAL2_REDACTION_MARKER'
        response=client.post(url+'/chat',headers=headers,json={'revision':0,'text':marker})
        logger.removeHandler(handler)
        counts={'records':len(stream.getvalue().splitlines()),'text':stream.getvalue().count(marker),'token':stream.getvalue().count(b['token'])}
        assert response.status_code == 200 and counts['records'] > 0 and counts['text'] == counts['token'] == 0
        print('log_counts',json.dumps(counts))
        os.environ.pop('FOODTOUR_CHAT_V2')
        flag={'chat':client.post(url+'/chat',headers=headers,json={'revision':response.json()['revision'],'text':'hello'}).status_code,
              'feature':client.get('/v1/client-config').json()['features']['chat_v2']}
        assert flag == {'chat':404,'feature':False}
        print('flag_off',json.dumps(flag))

files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
patterns={'google_api_keys':r'AIza[0-9A-Za-z_-]{35}', 'openai_keys':r'sk-(proj-)?[A-Za-z0-9_-]{30,}',
    'private_key_headers':r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'foody_venue_url_reference_files':r'https?://(www\.)?foody\.vn/(ha-noi|ho-chi-minh)/',
    'csv_row_header_reference_files':r'(^|,)(RestaurantId|RestaurantName|restaurant_id),'}
counts={label:len(subprocess.run(['git','grep','-I','-l','-E',pattern,'--','.'],cwd=ROOT,capture_output=True,check=False).stdout.splitlines()) for label,pattern in patterns.items()}
counts.update(tracked_env_files=sum(Path(f).name=='.env' or Path(f).name.startswith('.env.') and not f.endswith('.example') for f in files),
    tracked_csv=sum(f.lower().endswith('.csv') for f in files),
    tracked_private_dataset_names=sum(bool(re.search(r'restaurants(?:_enriched)?|foody.*\.(csv|json)',f,re.I)) for f in files))
def rows(value):
    if isinstance(value,dict):
        direct=any(isinstance(v,str) and re.search(patterns['foody_venue_url_reference_files'],v) for v in value.values())
        yield int(direct and bool(value.get('name') or value.get('venue_name')) and bool(set(value)&{'lat','lon','latitude','longitude'}))
        for child in value.values(): yield from rows(child)
    elif isinstance(value,list):
        for child in value: yield from rows(child)
current=json.loads((ROOT/'docs/audit.json').read_text(encoding='utf-8'))
baseline=json.loads(subprocess.check_output(['git','show','08041a1:docs/audit.json'],cwd=ROOT))
counts['current_audit_venue_rows']=sum(rows(current))
counts['baseline_08041a1_audit_venue_rows']=sum(rows(baseline))
print('scan_counts',json.dumps(counts,sort_keys=True))
assert counts['current_audit_venue_rows']==0 and counts['baseline_08041a1_audit_venue_rows']==1
