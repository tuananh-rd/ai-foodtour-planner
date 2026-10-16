import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.data.loader import load_dataset
from app.chat.gazetteer import Gazetteer
from app.main import create_app

ROOT=Path(__file__).resolve().parents[3]
FIXTURE=ROOT/'contracts/fixtures/venues.chat.synthetic.json'
SCORES=('rating_quality','rating_location','rating_service','rating_space','rating_price')

class SourceMetadata(unittest.TestCase):
    def load(self, **changes):
        row=dict(id='SYN-1',name='[SYNTHETIC] Source metadata',lat=21.03,lon=105.85,geo_ok=True,synthetic=True,dish_tags=['Phở'])
        row.update(changes)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'synthetic.json'; path.write_text(json.dumps([row]),encoding='utf-8')
            return load_dataset(path).venues[0]
    def test_optional_fields_and_bounds(self):
        for value in (None,True,-1,1.5,'bad',float('inf'),100001):
            self.assertIsNone(self.load(capacity_value=value).capacity_value)
        for name in ('prep_time_min','prep_time_max'):
            for value in (None,True,-1,1441,1.5,'bad'):
                self.assertIsNone(getattr(self.load(**{name:value}),name))
            for value in (0,1440): self.assertEqual(getattr(self.load(**{name:value}),name),value)
        for value in (1,100000,'40'):
            self.assertEqual(self.load(capacity_value=value).capacity_value,int(value))
    def test_subscores_normalized_without_evidence_promotion(self):
        v=self.load(rating_scale_max=10,**{key:8 for key in SCORES})
        self.assertEqual([getattr(v,key) for key in SCORES],[4]*5)
        for value in (True,-1,11,'bad',float('nan')):
            self.assertIsNone(self.load(rating_scale_max=10,rating_quality=value).rating_quality)
        self.assertIsNone(self.load(rating_quality=4).rating_quality)
        self.assertIsNone(v.hours)
        self.assertEqual(v.price_evidence,'estimate')
    def test_compare_and_venue_view_through_api(self):
        env=patch.dict(os.environ,{'FOODTOUR_CHAT_V2':'1','FOODTOUR_LLM':'off','FOODTOUR_EXPLAIN':'template','FOODTOUR_SESSION_DB':'','FOODTOUR_ROUTING':'estimate'})
        env.start(); self.addCleanup(env.stop)
        client=TestClient(create_app(data_path=FIXTURE))
        s=client.post('/v1/sessions').json(); headers={'X-Session-Token':s['token']}; url='/v1/sessions/'+s['session_id']+'/chat'
        def post(rev,action):
            r=client.post(url,headers=headers,json={'revision':rev,'action':action}); self.assertEqual(r.status_code,200,r.text); return r.json()
        post(0,{'type':'set_location','location':{'district':'Hoàn Kiếm'}})
        result=post(1,{'type':'search','query':'phở'})
        ids=[x['venue_id'] for x in result['chat']['last_results'][:2]]
        result=post(2,{'type':'compare','venue_ids':ids,'criteria':['capacity','prep_time']})
        table=next(b for b in result['reply']['blocks'] if b['type']=='compare_table')
        blob=json.dumps(table,ensure_ascii=False)
        self.assertIn('theo nguồn',blob)
        venues={v.id:v for v in load_dataset(FIXTURE).venues}
        for identity in ids:
            v=venues[identity]
            for expected in (f'{v.capacity_value} chỗ',f'~{v.prep_time_min} phút'):
                if 'None' not in expected: self.assertIn(expected,blob)
        r=client.get('/v1/venues/'+ids[0]); self.assertEqual(r.status_code,200,r.text)
        for name in ('capacity_value','prep_time_min','prep_time_max',*SCORES):
            self.assertEqual(r.json()[name],getattr(venues[ids[0]],name))

class LoadedGazetteer(unittest.TestCase):
    def test_loaded_prefixes_streets_deterministic_and_fast_1702(self):
        rows=json.loads(FIXTURE.read_text(encoding='utf-8'))['venues']
        expanded=[]
        for i in range(1702):
            row=dict(rows[i%len(rows)],id=f'SYN-{i:04d}',source_url=f'https://example.invalid/scale/{i}')
            row['district']=('Quận ' if i%2 else 'Huyện ')+row['district']
            expanded.append(row)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'synthetic.json'; path.write_text(json.dumps(expanded),encoding='utf-8')
            ds=load_dataset(path)
        t=time.perf_counter(); gz=Gazetteer(ds.venues)
        answers=[gz.resolve(q) for q in ('Quận Hoàn Kiếm','Huyện Hoàn Kiếm','Hoan Kiem','Xuân Thủy')]
        elapsed=time.perf_counter()-t
        self.assertEqual(len(ds.venues),1702)
        self.assertTrue(all(answers)); self.assertEqual(answers[0],answers[1]); self.assertEqual(answers[0],answers[2])
        self.assertEqual(answers[3].kind,'street')
        gz2=Gazetteer(reversed(ds.venues))
        for q in ('Quận Hoàn Kiếm','Huyện Hoàn Kiếm','Hoan Kiem','Xuân Thủy'):
            a,b=gz.resolve(q),gz2.resolve(q)
            self.assertEqual((a.kind,a.label),(b.kind,b.label))
            self.assertAlmostEqual(a.lat,b.lat,places=10); self.assertAlmostEqual(a.lon,b.lon,places=10)
        self.assertLess(elapsed,0.2)
        print('SYNTHETIC AGGREGATES',json.dumps({'rows':len(ds.venues),'districts':len(gz.districts),'streets':len(gz.streets),'elapsed_s':round(elapsed,5)}))
    @unittest.skipUnless(os.getenv('FOODTOUR_DATA_PATH','').lower().endswith('.csv'),'private CSV not configured via FOODTOUR_DATA_PATH')
    def test_configured_private_csv_aggregates_only(self):
        ds=load_dataset(); gz=Gazetteer(ds.venues)
        print('PRIVATE AGGREGATES',json.dumps({'rows':len(ds.venues),'districts':len(gz.districts),'streets':len(gz.streets)}))
        self.assertGreater(len(gz.districts),0)

if __name__=='__main__': unittest.main()
