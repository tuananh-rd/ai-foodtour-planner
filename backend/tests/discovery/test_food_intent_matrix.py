"""General request intent and origin resumption, using explicit synthetic menu evidence."""
import unittest
from app.data.loader import Dataset
from app.discovery.engine import handle
from app.discovery.experience import location_action
from app.discovery.state import State
from app.discovery.tools import Tools
from app.planner.interfaces import StraightLineEstimator
from app.planner.relevance import fold_uncached
from app.planner.types import Venue

DISHES = [('phở gà', 'pho ga', 'chicken'), ('phở bò', 'pho bo', 'beef'),
          ('phở cuốn', 'pho cuon', 'roll'), ('gà rán', 'ga ran', 'fried'),
          ('bún chả', 'bun cha', 'bun'), ('cơm', 'com', 'rice'),
          ('bánh thiên hà', 'banh thien ha', None)]


def matrix_data():
    rows = []
    for food, _, identity in DISHES:
        if identity:
            for n in range(3):
                rows.append(Venue(f'{identity}{n}', f'[SYNTHETIC] {identity} {n}',
                    21.02 + len(rows)*.00002, 105.83, district='Đống Đa',
                    address='Đống Đa, Hà Nội', dish_tags=(f'Món ăn; {food}, thử nghiệm',),
                    synthetic=True, hours={day: [(0, 1440)] for day in range(7)},
                    price_min_vnd=30000, price_max_vnd=70000))
    rows.append(Venue('name_only', '[SYNTHETIC] Gà rán phở gà bánh thiên hà',21.02,105.83,
                      district='Đống Đa',dish_tags=('ăn vặt',),synthetic=True))
    rows.append(Venue('fried_hbt', '[SYNTHETIC] fried other area',21.021,105.831,
                      district='Hai Bà Trưng',dish_tags=('gà rán',),synthetic=True))
    return Dataset(tuple(rows),'synthetic-food-matrix','synthetic',len(rows),{}, {})


class FoodIntentMatrixTests(unittest.TestCase):
    def setUp(self): self.data=matrix_data()
    def tools(self,state): return Tools(state,self.data,StraightLineEstimator())
    def say(self,state,text): return handle(text,self.tools(state))
    def choose(self,state):
        tools=self.tools(state)
        location_action(state,tools,{'operation':'resolve','query':'Đống Đa'})
        candidate=next(c for c in state.location['candidates'] if c['label']=='Đống Đa')
        return location_action(state,tools,{'operation':'choose','candidate_id':candidate['id']})

    def test_exact_rejected_transcript(self):
        state=State()
        self.say(state,'chào bạn')
        first,_=self.say(state,'tôi muốn ăn gà rán tại đống đa')
        self.assertEqual(state.profile.foods,['gà rán'])
        self.assertIsNotNone(state.pending_search)
        self.assertIsNotNone(first['question'])
        self.choose(state)
        self.assertEqual(set(state.results),{'fried0','fried1','fried2'})
        result,_=self.say(state,'tôi muốn ăn gà rán')
        self.assertEqual(result['status'],'ok')
        self.assertEqual(set(state.results),{'fried0','fried1','fried2'})

    def test_matrix_accents_and_origin_before_after(self):
        for accented,ascii_food,identity in DISHES:
            for food in (accented,ascii_food):
                for origin_first in (True,False):
                    with self.subTest(food=food,origin_first=origin_first):
                        state=State()
                        if origin_first: self.choose(state)
                        reply,provider=self.say(state,'tôi muốn ăn '+food+' tại Đống Đa')
                        if not origin_first:
                            self.assertIsNotNone(state.pending_search)
                            self.assertEqual(state.results,[])
                            reply=self.choose(state)
                        self.assertEqual([fold_uncached(x) for x in state.profile.foods],[fold_uncached(food)])
                        expected={f'{identity}{n}' for n in range(3)} if identity else set()
                        self.assertEqual(set(state.results),expected)
                        self.assertEqual(reply['status'],'ok' if identity else 'no_results')
                        self.assertEqual(provider['calls'],0)

    def test_main_dish_not_allergy_or_incidental_knowledge(self):
        for text in ('tôi dị ứng gà rán','phở bò khác phở gà thế nào?',
                     'quán có tag gà rán nghĩa là gì?'):
            with self.subTest(text=text):
                state=State();self.choose(state)
                self.say(state,text)
                self.assertEqual(state.profile.foods,[])
                self.assertEqual(state.results,[])
        state=State();self.choose(state)
        self.say(state,'tôi muốn ăn gà rán, tôi dị ứng đậu phộng và không ăn phở')
        self.assertEqual(state.profile.foods,['gà rán'])

    def test_food_area_changes_and_selected_lock_preserved(self):
        state=State();self.choose(state)
        self.say(state,'tôi muốn ăn phở bò ở Đống Đa')
        state.selection=[{'id':'beef0','locked':True}]
        state.comparison=['beef0','beef1']
        origin=state.profile.origin.model_copy()
        self.say(state,'đổi món sang gà rán')
        self.assertEqual(set(state.results),{'fried0','fried1','fried2'})
        self.assertEqual(state.comparison,[])
        self.assertEqual(state.profile.origin,origin)
        self.assertEqual(state.selection,[{'id':'beef0','locked':True}])
        result,_=self.say(state,'đổi khu vực sang Hai Bà Trưng')
        self.assertEqual(state.profile.area,'Hai Bà Trưng')
        self.assertEqual(state.results,['fried_hbt'])
        self.assertEqual(state.selection,[{'id':'beef0','locked':True}])

    def test_restored_pending_unknown_food_resumes_no_data(self):
        state=State()
        self.say(state,'tôi muốn ăn bánh thiên hà ở Đống Đa')
        restored=State.restore(state.dump())
        reply=self.choose(restored)
        self.assertEqual(reply['status'],'no_results')
        self.assertEqual(restored.profile.foods,['bánh thiên hà'])
        self.assertEqual(restored.results,[])

    def test_location_without_tour_never_claims_an_old_tour(self):
        state=State()
        reply=self.choose(state)
        self.assertNotIn('tour cũ',reply['text'])

    def test_request_without_dish_asks_specific_question_not_unrelated_cards(self):
        state=State();self.choose(state)
        reply,_=self.say(state,'tôi muốn ăn')
        self.assertIsNotNone(reply['question'])
        self.assertEqual(state.results,[])

    def test_native_preference_ack_is_not_a_completed_search(self):
        state=State();self.choose(state)
        class Model:
            configured=True
            mode='mock'
            calls=0
            def generate(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1:
                    return {'role':'model','parts':[{'functionCall':{'name':'update_preferences',
                        'args':{'patch':{'foods':['gà rán']}}}}]}
                return {'role':'model','parts':[{'text':'Đã ghi nhận phần bạn vừa sửa.'}]}
        reply,provider=handle('toi muon an ga ran',self.tools(state),model=Model())
        self.assertEqual(set(state.results),{'fried0','fried1','fried2','fried_hbt'})
        self.assertEqual(reply['status'],'ok')
        self.assertEqual(provider['reply_source'],'tools')

    def test_native_timeout_after_preference_ack_still_completes_local_read(self):
        state=State();self.choose(state)
        class Model:
            configured=True
            mode='mock'
            calls=0
            def generate(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1:
                    return {'role':'model','parts':[{'functionCall':{'name':'update_preferences',
                        'args':{'patch':{'foods':['gà rán']}}}}]}
                raise TimeoutError()
        reply,provider=handle('tôi muốn ăn gà rán',self.tools(state),model=Model())
        self.assertEqual(reply['status'],'ok')
        self.assertTrue(state.results)
        self.assertEqual(provider['failure']['kind'],'timeout')
        self.assertEqual(provider['reply_source'],'rules')
