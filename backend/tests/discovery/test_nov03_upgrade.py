"""Offline synthetic acceptance; no provider generation or private records."""
import json,os,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.discovery.food import matches_food,food_intent
from app.discovery.engine import handle,safe_answer,tool_projection,model_projection
from app.discovery.state import State
from app.discovery.tools import Tools
from app.discovery.experience import location_action
from app.providers.reverse_address import ReverseAddress
from app.planner.interfaces import StraightLineEstimator
from app.data.menu_catalog import catalog
from backend.tests.discovery.test_menu_sample import menu_archive
from backend.tests.discovery.test_food_intent_matrix import matrix_data


class UpgradeTests(unittest.TestCase):
    def tools(self,state=None):return Tools(state or State(),matrix_data(),StraightLineEstimator())

    def test_pho_soup_contrasts_accents_tokens_and_specific_phrases(self):
        negatives=['phô mai','pho mai','phố Huế','pho Hue','tào phớ','tao pho',
                   'phở cuốn','pho cuon','trà sữa phô mai','phở xào','phởgà']
        positives=['phở gà','pho ga','Phở bò tái','pho bo','phở','combo phở gà']
        for query in ('phở','pho'):
            for name in negatives+positives:
                with self.subTest(query=query,name=name):
                    self.assertEqual(matches_food(SimpleNamespace(dish_tags=[name]),query),name in positives)
        for query,name,expected in [('phở gà','phở bò',False),('pho ga','phở gà',True),
            ('phở cuốn','phở cuốn',True),('phô mai','kem phô mai',True),('gà rán','gà rán',True),
            ('bánh thiên hà','bánh thiên hà',True),('phở','phở mai',False)]:
            self.assertEqual(matches_food(SimpleNamespace(dish_tags=[name]),query),expected)

    def test_exact_request_area_search_without_origin_then_change_food(self):
        state=State();tools=self.tools(state)
        result,provider=handle('tôi muốn ăn phở ở đống đa, 2 người ăn, ngân sách khoảng 300k',tools)
        self.assertTrue(state.results);self.assertIsNone(state.profile.origin)
        self.assertTrue(all(tools.restaurant(i)['distance_m'] is None for i in state.results))
        self.assertTrue(all(matches_food(tools.by_id[i],'phở') for i in state.results))
        self.assertEqual(provider['calls'],0)
        result,_=handle('tôi muốn ăn bánh thiên hà',self.tools(state))
        self.assertEqual(result['status'],'no_results');self.assertEqual(state.results,[])
        self.assertEqual(food_intent('tôi muốn ăn phở gà và gà rán'),['phở gà','gà rán'])

    def test_restore_hides_stale_unrelated_results_preserving_selected_lock(self):
        state=State();state.patch({'foods':['phở']});state.results=['fried0','chicken0']
        state.selection=[{'id':'fried0','locked':True}]
        self.tools(state)
        self.assertEqual(state.results,['chicken0'])
        self.assertEqual(state.selection,[{'id':'fried0','locked':True}])

    def test_grounded_prices_allowed_and_fabricated_prices_mutations_health_rejected(self):
        tools=self.tools()
        evidence=[{'matching_menu':[{'name':'Món thử','reference_price_vnd':88000}]}]
        self.assertEqual(safe_answer('Món này có giá 88.000 đồng.',tools,evidence),'Món này có giá 88.000 đồng.')
        self.assertEqual(safe_answer('Món này có giá 88k.',tools,evidence),'Món này có giá 88k.')
        self.assertIsNone(safe_answer('Món này có giá 99k.',tools,evidence))
        self.assertIsNone(safe_answer('Đã thêm quán.',tools,evidence))
        self.assertIsNone(safe_answer('Quán an toàn dị ứng.',tools,evidence))
        projected=tool_projection({'lat':21.027123,'origin':{'lon':105.123456},'allergies':['private'],
            'matching_menu':[{'reference_price_vnd':88000}],'distance_m':1234})
        self.assertNotIn('lat',projected);self.assertNotIn('origin',projected)
        self.assertNotIn('allergies',projected);self.assertEqual(projected['distance_m'],1200)
        self.assertEqual(projected['matching_menu'][0]['reference_price_vnd'],88000)

    def test_native_mocked_loop_search_without_origin_preserves_grounded_menu(self):
        class Model:
            configured=True;mode='mock';calls=0
            def generate(self,*args,**kwargs):
                self.calls+=1
                return {'role':'model','parts':[{'functionCall':{'name':'search_restaurants','args':{}}}]} if self.calls==1 else {
                    'role':'model','parts':[{'text':'Bạn có thể xem các quán phù hợp trong kết quả.'}]}
        state=State();result,provider=handle('tôi muốn ăn gà rán ở Đống Đa',self.tools(state),model=Model())
        self.assertTrue(state.results);self.assertIsNone(state.profile.origin)
        self.assertEqual(provider['calls'],2);self.assertEqual(state.selection,[])

    def test_detailed_address_candidates_explicit_choice_cache_and_map(self):
        payload={'features':[{'geometry':{'coordinates':[105.84,21.02]},
            'properties':{'street':'Đường thử','housenumber':'12','city':'Hà Nội','type':'house'}}]}
        calls=[];clock=[100.0]
        service=ReverseAddress(search_transport=lambda q:calls.append(q) or payload,
            transport=lambda lat,lon:payload,clock=lambda:clock[0])
        tools=self.tools();state=tools.state
        result=location_action(state,tools,{'operation':'resolve','query':'12 Đường thử Hà Nội'},service)
        self.assertIsNone(state.profile.origin);self.assertEqual(len(state.location['candidates']),1)
        choice=state.location['candidates'][0];self.assertIn('12',choice['label'])
        location_action(state,tools,{'operation':'choose','candidate_id':choice['id']},service)
        self.assertEqual(state.location['source'],'photon');self.assertEqual(state.profile.origin.lat,21.02)
        service.search('12 Đường thử Hà Nội');self.assertEqual(len(calls),1)
        clock[0]+=2
        location_action(state,tools,{'operation':'coordinates','source':'map','lat':21.02,'lon':105.84,
            'resolve_address':True},service)
        self.assertEqual(state.location['source'],'map')

    def test_full_canonical_menu_groups_options_pagination_nonfood_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'menu.zip';menu_archive(path)
            first=catalog(path,'fried0',limit=2);seen=[]
            self.assertEqual(first['total_menu'],6)
            for offset in range(0,first['total'],2):seen.extend(r['id'] for r in catalog(path,'fried0',offset=offset,limit=2)['items'])
            self.assertEqual(len(seen),len(set(seen)));self.assertNotIn('dish1',seen)
            option=catalog(path,'fried0',dish_id='dish3',option_limit=1)['items'][0]
            self.assertEqual(option['min_total_vnd'],35000);self.assertEqual(option['options_total'],2)
            self.assertFalse(option['options_complete']);self.assertTrue(option['option_groups'][0]['mandatory'])
            rest=catalog(path,'fried0',dish_id='dish3',option_offset=1,option_limit=1)['items'][0]
            self.assertTrue(rest['options_complete'])
            quarantined=catalog(path,'fried0',dish_id='dish2')['items'][0]
            self.assertIsNone(quarantined['price_vnd'])
            self.assertEqual(catalog(path,'absent')['status'],'unavailable')

    def test_menu_endpoint_auth_visibility_and_bounds(self):
        from app.main import create_app
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'menu.zip';menu_archive(path)
            with patch.dict(os.environ,{'FOODTOUR_MENU_PATH':str(path),'FOODTOUR_LLM':'mock',
                'FOODTOUR_SESSION_DB':'','FOODTOUR_EVIDENCE_PATH':'','FOODTOUR_CHAT_V2':'1'}), \
                    TestClient(create_app(data_path=Path(directory)/'absent.json')) as client:
                session=client.post('/v1/sessions').json();base=f"/v1/sessions/{session['session_id']}"
                headers={'X-Session-Token':session['token']}
                self.assertEqual(client.get(base+'/venues/fried0/menu').status_code,401)
                self.assertEqual(client.get(base+'/venues/fried0/menu',headers=headers).status_code,403)
                client.post(base+'/assistant',headers=headers,json={'revision':0,'text':'tôi muốn ăn gà rán'})
                result=client.get(base+'/venues/fried0/menu',headers=headers)
                self.assertEqual(result.status_code,200,result.text)
                self.assertEqual(result.json()['total_menu'],6)
                self.assertEqual(client.get(base+'/venues/fried0/menu?limit=500',headers=headers).status_code,422)
