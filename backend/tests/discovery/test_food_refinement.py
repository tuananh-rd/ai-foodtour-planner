"""Specific dish refinement is read-only; synthetic data, no provider transports."""
import unittest
from app.data.loader import Dataset
from app.planner.types import Venue
from app.planner.interfaces import StraightLineEstimator
from app.discovery.state import State
from app.discovery.tools import Tools
from app.discovery.engine import handle, food_intent
from app.discovery.food import matches_food
from app.discovery.experience import location_action


def refinement_data(with_chicken=True):
    rows = [
        ('roll', '[SYNTHETIC] Cuốn', ('phở cuốn',)),
        ('snack', '[SYNTHETIC] Ăn vặt', ('nem chua rán / hotdog',)),
        ('name_only', '[SYNTHETIC] Phở gà tên quán', ('ăn vặt',)),
        ('beef', '[SYNTHETIC] Bò', ('phở bò',)),
    ]
    if with_chicken:
        rows.append(('chicken', '[SYNTHETIC] Quán thử gà', ('Món nước; Phở gà, cháo gà',)))
    return Dataset(tuple(Venue(i, name, 21.02+n*.0001, 105.83+n*.0001,
        district='Đống Đa', address='Đống Đa, Hà Nội', dish_tags=tags, synthetic=True,
        price_min_vnd=30000, price_max_vnd=70000) for n,(i,name,tags) in enumerate(rows)),
        'synthetic-refinement', 'synthetic', len(rows), {}, {})


class FoodRefinementTests(unittest.TestCase):
    def tools(self, state, data): return Tools(state, data, StraightLineEstimator())

    def test_exact_rules_transcript_specific_match_and_locked_selection(self):
        data, state = refinement_data(), State()
        first, _ = handle('tôi muốn ăn phở', self.tools(state, data))
        self.assertIsNone(state.profile.origin)
        self.assertIsNotNone(first['question'])
        location_action(state, self.tools(state, data), {'operation':'coordinates',
            'source':'coordinates','lat':21.02,'lon':105.83})
        self.assertTrue(state.results)
        state.selection=[{'id':'beef','locked':True}]
        state.comparison=['roll','beef']
        state.confirmation={'id':'old'}
        state.plan_requested=True
        state.pending_slot='start_time'
        before=state.profile.origin.model_copy()
        result, provider=handle('tôi muốn ăn phở gà cơ', self.tools(state, data))
        self.assertEqual(state.profile.foods, ['phở gà'])
        self.assertEqual(state.profile.origin, before)
        self.assertEqual(state.results, ['chicken'])
        self.assertEqual(state.comparison, [])
        self.assertEqual(state.selection,[{'id':'beef','locked':True}])
        self.assertIsNone(state.confirmation)
        self.assertTrue(state.tour_stale)
        self.assertFalse(state.plan_requested)
        self.assertIsNone(state.pending_slot)
        self.assertNotIn('chưa được',result['text'])
        self.assertEqual(provider['calls'],0)

    def test_missing_specific_dish_never_relaxes_to_roll_or_snacks(self):
        data,state=refinement_data(False),State()
        state.patch({'origin':{'lat':21.02,'lon':105.83},'foods':['phở']})
        self.tools(state,data).run('search_restaurants',{'dish':'phở'})
        result,_=handle('tôi muốn ăn phở gà cơ',self.tools(state,data))
        self.assertEqual(state.results,[])
        self.assertEqual(result['status'],'no_results')
        self.assertIn('phở gà',result['text'])

    def test_compound_intent_preserves_specific_phrase(self):
        self.assertEqual(food_intent('tôi muốn ăn phở gà với tráng miệng'),['phở gà','tráng miệng'])
        self.assertEqual(food_intent('tôi muốn ăn tào phớ'),['tào phớ'])

    def test_food_intent_uses_search_phrase_not_editorial_heading(self):
        for phrase in ('bún', 'nem', 'trà', 'sinh tố', 'bánh'):
            with self.subTest(phrase=phrase):
                intent = food_intent('tôi muốn ăn ' + phrase)
                self.assertEqual(intent, [phrase])
                venue = Venue('tagged', 'Không suy món từ tên', 21.02, 105.83,
                              dish_tags=(phrase,))
                self.assertTrue(matches_food(venue, intent[0]))

    def test_native_mock_refinement_does_not_require_selection_permission(self):
        state,data=State(),refinement_data()
        state.patch({'origin':{'lat':21.02,'lon':105.83},'foods':['phở']})
        self.tools(state,data).run('search_restaurants',{'dish':'phở'})
        class Model:
            configured=True
            mode='mock'
            calls=0
            def generate(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1:
                    return {'role':'model','parts':[{'functionCall':{'name':'update_preferences','args':{'patch':{'foods':['phở gà']}}}},
                        {'functionCall':{'name':'search_restaurants','args':{'dish':'phở'}}}]}
                return {'role':'model','parts':[{'text':'Có quán theo dữ liệu món bạn vừa chọn.'}]}
        reply,provider=handle('tôi muốn ăn phở gà cơ',self.tools(state,data),model=Model())
        self.assertEqual(state.results,['chicken'])
        self.assertEqual(state.selection,[])
        self.assertNotEqual(reply.get('code'),'authority_denied')
        self.assertEqual(provider['calls'],2)

    def test_denied_native_mutation_cannot_block_authorized_food_search(self):
        state,data=State(),refinement_data()
        state.patch({'origin':{'lat':21.02,'lon':105.83},'foods':['phở']})
        self.tools(state,data).run('search_restaurants',{'dish':'phở'})
        class StaleModel:
            configured=True
            mode='mock'
            def generate(self,*args,**kwargs):
                return {'role':'model','parts':[{'functionCall':{'name':'update_foodtour_selection',
                    'args':{'operation':'add','venue_ids':['roll'],'selection_version':0}}}]}
        result,provider=handle('tôi muốn ăn phở gà cơ',self.tools(state,data),model=StaleModel())
        self.assertEqual(state.results,['chicken'])
        self.assertEqual(state.selection,[])
        self.assertIsNone(state.confirmation)
        self.assertEqual(provider['reason'],'denied_mutation_readonly_search')
        self.assertNotEqual(result.get('code'),'authority_denied')

    def test_specific_intent_with_model_text_only_still_requires_real_search(self):
        state,data=State(),refinement_data()
        state.patch({'origin':{'lat':21.02,'lon':105.83}})
        class TextOnly:
            configured=True
            mode='mock'
            def generate(self,*args,**kwargs): return {'role':'model','parts':[{'text':'Mình đã ghi nhận món bạn thích.'}]}
        _,provider=handle('tôi muốn ăn phở gà cơ',self.tools(state,data),model=TextOnly())
        self.assertEqual(state.results,['chicken'])
        self.assertEqual(provider['reason'],'model_missing_required_tool')

    def test_native_denial_then_explanation_still_reads_without_mutation(self):
        state,data=State(),refinement_data()
        state.patch({'origin':{'lat':21.02,'lon':105.83},'foods':['phở']})
        class Model:
            configured=True
            mode='mock'
            calls=0
            def generate(self,*args,**kwargs):
                self.calls+=1
                if self.calls==1:
                    return {'role':'model','parts':[{'functionCall':{'name':'update_preferences','args':{'patch':{'foods':['phở']}}}}]}
                return {'role':'model','parts':[{'text':'Thao tác chưa được xác nhận.'}]}
        result,_=handle('tôi muốn ăn phở gà cơ',self.tools(state,data),model=Model())
        self.assertEqual(state.results,['chicken'])
        self.assertNotEqual(result.get('code'),'authority_denied')
        self.assertEqual(state.selection,[])
