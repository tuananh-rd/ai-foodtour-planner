"""Synthetic archive contracts; no private records or external transports."""
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from dataclasses import replace
from app.data.menu import load_menu_archive, mapped_venues, matching_menu
from app.discovery.state import State
from app.discovery.engine import handle
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator
from backend.tests.discovery.test_food_intent_matrix import matrix_data


def menu_archive(path):
    dishes=[];items=[];links=[];options=[]
    names=['Gà rán phần thử','Hotline 0900000000','Gà rán giá lỗi','Gà rán chọn sốt',
           'Phở gà đã hết','Gà rán thiếu option','Nước thử']
    for n,name in enumerate(names):
        identity=f'dish{n}';item=f'item{n}'
        dishes.append({'dish_id':identity,'foody_id':'fried0','name_norm':name,
            'price_verification':'unverified' if n==2 else 'verified','conflict_status':'none',
            'budget_price_vnd':100 if n==2 else 30000,'min_total_vnd':None if n==2 else 35000 if n==3 else 30000,
            'has_mandatory_options':n in (3,5),'min_required_surcharge_status':'computed' if n in (3,5) else 'none_required',
            'is_available':n!=4})
        items.append({'item_id':item,'foody_id':'fried0','price_flag':'bad' if n==2 else None,
                      'fetched_at':'2026-11-02T00:00:00Z'})
        links.append({'dish_id':identity,'item_id':item})
    for price in (5000,10000):
        options.append({'item_id':'item3','option_group_id':'sauce','mandatory':True,'min_select':1,'option_price_vnd':price})
    docs={'shopeefood_dishes.json':{'dishes':dishes,'dish_groups':links},
        'shopeefood_menu_items.json':{'items':items},'shopeefood_menu_options.json':{'options':options},
        'shopeefood_mapping.json':{'venues':[{'foody_id':'fried0','match_status':'confirmed',
            'foody_name':'[SYNTHETIC] menu venue','foody_address':'Đống Đa, Hà Nội','foody_district':'Đống Đa',
            'shopee_lat':21.02,'shopee_lon':105.83}]}}
    with zipfile.ZipFile(path,'w') as archive:
        for name,data in docs.items():archive.writestr(name,json.dumps(data,ensure_ascii=False))


def menu_data():
    with tempfile.TemporaryDirectory() as tmp:
        archive=Path(tmp)/'synthetic.zip';menu_archive(archive)
        menu,counts,_=load_menu_archive(archive,{'fried0'})
    base=matrix_data()
    return replace(base,menu_by_venue=menu,menu_counts=counts,dataset_version='synthetic-menu-matrix')


class MenuSampleTests(unittest.TestCase):
    def test_contact_quarantine_required_options_and_unknowns(self):
        data=menu_data();rows=data.menu_by_venue['fried0']
        self.assertEqual(len(rows),6)
        self.assertFalse(any('Hotline' in r['name'] for r in rows))
        bad=next(r for r in rows if r['name']=='Gà rán giá lỗi')
        self.assertEqual(bad['price_status'],'quarantined')
        self.assertIsNone(bad['reference_price_vnd']);self.assertIsNone(bad['min_total_vnd'])
        mandatory=next(r for r in rows if r['name']=='Gà rán chọn sốt')
        self.assertEqual(mandatory['min_total_vnd'],35000)
        self.assertTrue(mandatory['mandatory_options'])
        unknown=next(r for r in rows if r['name']=='Gà rán thiếu option')
        self.assertIsNone(unknown['min_total_vnd'])
        self.assertEqual(unknown['price_status'],'minimum_unknown')
        self.assertEqual(matching_menu(rows,['phở gà']),[])

    def test_menu_evidence_overrides_coarse_tag_and_name_without_repricing_venue(self):
        data=menu_data();state=State()
        state.patch({'origin':{'lat':21.02,'lon':105.83},'area':'Đống Đa'})
        tools=Tools(state,data,StraightLineEstimator())
        reply,provider=handle('tôi muốn ăn gà rán',tools)
        self.assertIn('fried0',state.results)
        rendered=tools.restaurant('fried0')
        self.assertEqual(len(rendered['matching_menu']),3)
        self.assertEqual(rendered['price']['max_vnd'],70000)
        self.assertEqual(provider['calls'],0)
        handle('tôi muốn ăn phở gà',Tools(state,data,StraightLineEstimator()))
        self.assertNotIn('fried0',state.results)
        self.assertIsNone(state.confirmation)

    def test_explicit_confirmed_mapping_adds_only_missing_valid_venues(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive=Path(tmp)/'synthetic.zip';menu_archive(archive)
            self.assertEqual(len(mapped_venues(archive,set())),1)
            self.assertEqual(mapped_venues(archive,{'fried0'}),())
            self.assertIsNone(mapped_venues(archive,set())[0].price_min_vnd)

    def test_delivery_budget_uses_required_minimum_not_venue_range_or_quarantined_price(self):
        data=menu_data();state=State()
        state.patch({'origin':{'lat':21.02,'lon':105.83},'area':'Đống Đa'})
        rows=[r for r in data.menu_by_venue['fried0'] if r['name']=='Gà rán chọn sốt']
        data=replace(data,menu_by_venue={'fried0':rows})
        result,_=handle('tôi muốn ăn gà rán dưới 32k',Tools(state,data,StraightLineEstimator()))
        self.assertNotIn('fried0',state.results)
        self.assertIsNone(state.profile.budget_vnd)
        handle('tôi muốn ăn gà rán dưới 40k',Tools(state,data,StraightLineEstimator()))
        self.assertIn('fried0',state.results)

    def test_untrusted_menu_never_enters_model_tool_projection(self):
        from app.discovery.engine import tool_projection
        result=tool_projection({'restaurants':[{'name':'safe bounded venue','matching_menu':[{'name':'private menu'}]}]})
        self.assertNotIn('matching_menu',result['restaurants'][0])
