"""U5d: independent green mutation controls and honest confirmed regressions."""
import unittest
from .test_u1_guided import engine
from app.chat.state import ChatState, ShortItem
from app.planner.types import Preferences
from app.llm import safety_parse
from app.chat import coverage


class Controls(unittest.TestCase):
    def test_present_child_is_third_party(self):
        eng,_=engine()
        r=eng.handle(ChatState(),Preferences(),text='Con tôi dị ứng vừng, cháu đi cùng.')
        self.assertEqual([a.term for a in r.state.allergies],['vừng'])
        self.assertEqual(r.state.allergies[0].who,'con')  # who = the companion's head word (Claude changed the representation after U5d: one 'other' bit erased unrelated companions)

    def test_hypothetical_split_preserves_real_clause(self):
        eng,_=engine()
        r=eng.handle(ChatState(),Preferences(),text='Giả sử khách dị ứng trứng còn tôi dị ứng vừng thật')
        self.assertEqual([a.term for a in r.state.allergies],['vừng'])

    def test_term_before_cue(self):
        self.assertIn('vừng',safety_parse.parse('Vừng làm tôi dị ứng.').allergies)

    def test_symptom_cue(self):
        self.assertIn('vừng',safety_parse.parse('Vừng ăn vào là nổi mề đay.').allergies)

    def test_dish_scan_fronted(self):
        self.assertIn('bánh cuốn',coverage.extras('Bánh cuốn trước nha','banh cuon truoc nha').get('interests',[]))

    def test_dish_scan_negation(self):
        self.assertNotIn('bánh cuốn',coverage.extras('Không ăn bánh cuốn','khong an banh cuon').get('interests',[]))

    def test_finish_question_guard(self):
        eng,_=engine()
        # Feed a real result then duplicate its question, modeling overlapping handlers.
        r=eng.handle(ChatState(),Preferences(),text='Tôi dị ứng chưa rõ chất gì.')
        q=next(b for b in r.blocks if b['type']=='clarify')
        r.blocks.append(dict(q))
        eng._finish(r)
        self.assertEqual(sum(b['type']=='clarify' for b in r.blocks),1)


class ConfirmedFindings(unittest.TestCase):
    def turns(self,texts):
        eng,_=engine();st=ChatState();pr=Preferences()
        st.set_field('area',dict(kind='district',label='Hoàn Kiếm',lat=21.0285,lon=105.8522,district='Hoàn Kiếm'))
        st.set_field('duration_min',180);st.set_field('vehicle','walk')
        st.shortlist=[ShortItem(eng.venues[0].id)]
        for t in texts:
            r=eng.handle(st,pr,text=t);st,pr=r.state,r.prefs
        for action in ['request_plan','confirm_yes']:
            r=eng.handle(st,pr,action={'type':action});st,pr=r.state,r.prefs
        return r

    def test_absent_colleague_cannot_clear_present_child(self):
        r=self.turns(['Con tôi dị ứng vừng, cháu đi cùng.','Đồng nghiệp tôi không đi.'])
        self.assertTrue('vừng' in [a.term for a in r.state.allergies] or (r.state.allergy_unresolved and r.plan_request is None))

    def test_absent_grandparents_cannot_drop_present_child_sentence(self):
        r=self.turns(['Con tôi dị ứng vừng. Ông bà không đi.'])
        self.assertTrue('vừng' in [a.term for a in r.state.allergies] or (r.state.allergy_unresolved and r.plan_request is None))

    def test_unnamed_food_cannot_be_concrete_allergy(self):
        r=self.turns(['Tôi có dị ứng thực phẩm mà chưa rõ thủ phạm.'])
        self.assertTrue(r.state.allergy_unresolved)
        self.assertIsNone(r.plan_request)

    def test_unnamed_extra_cannot_be_concrete_allergy(self):
        r=self.turns(['Mình dị ứng hạt điều và bạn có dị ứng chưa chẩn đoán.'])
        self.assertTrue(r.state.allergy_unresolved)
        self.assertIsNone(r.plan_request)

    def test_southern_hen_not_mussel(self):
        r=self.turns(['Tôm khô ăn vào là nổi mề đay hen.'])
        self.assertTrue(any('tôm' in a.term for a in r.state.allergies) or r.state.allergy_unresolved)
        self.assertNotIn('hen',[a.term for a in r.state.allergies])

    def test_hypothetical_first_clause_not_invented(self):
        r=self.turns(['Nếu dị ứng bột mì thì hỏi sau; hiện tôi dị ứng hạt điều.'])
        self.assertNotIn('bột mì',[a.term for a in r.state.allergies])

    def test_uncertain_cashew_or_milk_held(self):
        r=self.turns(['Tui chưa chắc dị ứng hạt điều hay sữa bò.'])
        self.assertTrue(r.state.allergy_unresolved)
        self.assertIsNone(r.plan_request)

    def test_command_answer_cannot_resolve_unknown_allergy(self):
        r=self.turns(['Tôi dị ứng một thứ chưa rõ.','lên đường'])
        self.assertTrue(r.state.allergy_unresolved)
        self.assertIsNone(r.plan_request)
