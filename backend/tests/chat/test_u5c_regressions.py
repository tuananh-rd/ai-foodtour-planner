"""U5c independent review: new failures remain honest, without skips or xfails."""
import unittest
import time
import statistics

from .test_u1_guided import engine
from app.chat.state import ChatState, ShortItem
from app.chat.llm_understand import Outcome, sanitize
from app.planner.types import Preferences


class BlindRegressions(unittest.TestCase):
    def setUp(self):
        self.eng, self.venues = engine()

    def turns(self, texts):
        st, pr = ChatState(), Preferences()
        for text in texts:
            r = self.eng.handle(st, pr, text=text)
            st, pr = r.state, r.prefs
        return r

    def test_named_absence_before_cue_preserves_unrelated_allergy(self):
        r = self.turns(['Mình dị ứng lạc.', 'Tôm thì mình không dị ứng.'])
        self.assertEqual([a.term for a in r.state.allergies], ['lạc'])

    def test_hard_avoid_list_records_every_substance(self):
        r = self.turns(['Mình kiêng đậu phộng và sữa.'])
        self.assertEqual({a.term for a in r.state.allergies}, {'đậu phộng','sữa'})

    def test_fronted_hard_avoid_is_recorded_or_held(self):
        r = self.turns(['Đậu phộng thì em không ăn được đâu chị ơi.'])
        self.assertTrue(r.state.allergies or r.state.allergy_unresolved)

    def test_symptom_declaration_is_recorded_or_held(self):
        r = self.turns(['Tôi bị mẩn ngứa khi ăn tôm.'])
        self.assertTrue(r.state.allergies or r.state.allergy_unresolved)

    def test_fronted_allergy_does_not_emit_two_questions(self):
        r = self.turns(['Lạc làm mình dị ứng, đừng cho lạc vào nhé.'])
        self.assertLessEqual(sum(b['type']=='clarify' for b in r.blocks), 1)

    def test_absent_person_in_separate_clause_records_nothing(self):
        r = self.turns(['Chị tôi không đi chuyến này; chị dị ứng tôm.'])
        self.assertFalse(r.state.allergies)

    def test_hypothetical_variant_records_nothing(self):
        r = self.turns(['Giả dụ khách dị ứng sữa thì bạn xử lý ra sao?'])
        self.assertFalse(r.state.allergies)

    def test_negated_proposition_records_nothing(self):
        r = self.turns(['Không có chuyện mình dị ứng trứng nhé.'])
        self.assertFalse(r.state.allergies)

    def test_postponed_hard_avoid_remains_safety_relevant(self):
        r = self.turns(['Chuyện tour để sau nha vì mình kiêng mè nên phải xem nguyên liệu trước.'])
        self.assertTrue(r.state.allergies or r.state.allergy_unresolved)

    def test_unknown_additional_substance_keeps_obligation(self):
        r = self.turns(['Tôi dị ứng lạc, còn thứ gây ngứa kia chưa rõ.'])
        self.assertTrue(r.state.allergy_unresolved)

    def test_sarcastic_price_allergy_is_not_shrimp_allergy(self):
        r = self.turns(['Dị ứng giá cao thôi 🤣 chứ tôm mình ăn bình thường.'])
        self.assertFalse(r.state.allergies)

    def test_uncertainty_does_not_record_word_khong_as_substance(self):
        r = self.turns(['Nghĩ lại thì chưa biết có phải dị ứng không, ăn hạt đó thấy ngứa.'])
        self.assertFalse(r.state.allergies)
        self.assertTrue(r.state.allergy_unresolved)

    def test_allergy_food_quotation_is_retained_or_held(self):
        r = self.turns(['Mình dị ứng "đậu phộng" đó.'])
        self.assertTrue(r.state.allergies or r.state.allergy_unresolved)

    def test_elliptical_allergy_addition_does_not_disappear(self):
        r = self.turns(['Tôi dị ứng tôm.', 'À thêm sữa nữa.'])
        self.assertTrue('sữa' in [a.term for a in r.state.allergies] or r.state.allergy_unresolved)

    def test_duration_ruoi_does_not_ground_invented_clock(self):
        llm = lambda *a: Outcome(sanitize({'intent':'UPDATE_PROFILE','patch':{'start_time':'19:00','end_time':'21:00'}}),1)
        r = self.eng.handle(ChatState(),Preferences(),
            text='Tour 3 quán khoảng 1 tiếng rưỡi, mình dị ứng mấy thứ rang giòn',llm=llm)
        self.assertEqual(r.llm_calls, 1)
        self.assertFalse(r.state.profile['start_time'].known())
        self.assertFalse(r.state.profile['end_time'].known())

    def test_shared_taste_does_not_ground_budget_scope(self):
        llm = lambda *a: Outcome(sanitize({'intent':'UPDATE_PROFILE','patch':{'budget_scope':'group'}}),1)
        r = self.eng.handle(ChatState(),Preferences(),
            text='Tour 3 quán tối nay 120 phút, chung sở thích phở, ngân sách 500k cho 2 người, mình dị ứng mấy thứ rang giòn',llm=llm)
        self.assertEqual(r.llm_calls, 1)
        self.assertIsNone(r.state.profile['budget'].scope)

    def test_absent_friend_does_not_erase_speakers_allergy(self):
        r = self.turns(['Tôi dị ứng tôm nhưng bạn tôi không đi cùng'])
        self.assertTrue('tôm' in [a.term for a in r.state.allergies] or r.state.allergy_unresolved)

    def test_real_allergy_after_unpunctuated_hypothetical_is_not_lost(self):
        r = self.turns(['Giả sử bạn dị ứng trứng còn tôi dị ứng lạc thật'])
        self.assertTrue('lạc' in [a.term for a in r.state.allergies] or r.state.allergy_unresolved)

    def test_repeated_allergy_cues_have_bounded_processing_time(self):
        # 250 ms per 1000-character turn on this review machine; median reduces
        # scheduler noise. The former parser control takes about 7 ms; this
        # regression takes about 700 ms even with no other workload.
        text = ('dị ứng '*1000)[:1000]
        samples=[]
        for _ in range(3):
            start=time.perf_counter()
            self.eng.handle(ChatState(),Preferences(),text=text)
            samples.append(time.perf_counter()-start)
        self.assertLess(statistics.median(samples), .25)


class GuardControls(unittest.TestCase):
    """Green committed controls used for mutation kills, separate from findings."""
    def setUp(self):
        self.eng, _ = engine()

    def test_absent_person_guard(self):
        r=self.eng.handle(ChatState(),Preferences(),text='Bạn tôi dị ứng tôm nhưng không đi cùng')
        self.assertFalse(r.state.allergies)

    def test_hypothetical_clause_guard(self):
        r=self.eng.handle(ChatState(),Preferences(),text='Nếu tôi dị ứng trứng thì phải tránh gì?')
        self.assertFalse(r.state.allergies)

    def test_named_absence_guard(self):
        r=self.eng.handle(ChatState(),Preferences(),text='Tôi dị ứng lạc')
        r=self.eng.handle(r.state,r.prefs,text='Tôi không bị dị ứng tôm')
        self.assertEqual([a.term for a in r.state.allergies],['lạc'])

    def test_hard_cue_guard(self):
        r=self.eng.handle(ChatState(),Preferences(),text='Mình kiêng trứng')
        self.assertEqual([a.term for a in r.state.allergies],['trứng'])

    def test_model_symptom_guard(self):
        llm=lambda *a:Outcome(sanitize({'intent':'SET_ALLERGY','patch':{'allergy':['ngứa họng']}}),1)
        r=self.eng.handle(ChatState(),Preferences(),
            text='Tour 3 quán quanh Hồ Gươm, mình dị ứng mấy thứ rang giòn',llm=llm)
        self.assertFalse(r.state.allergies)
        self.assertTrue(r.state.allergy_unresolved)

    def test_model_description_guard(self):
        llm=lambda *a:Outcome(sanitize({'intent':'SET_ALLERGY','patch':{'allergy':['vỏ cứng']}}),1)
        r=self.eng.handle(ChatState(),Preferences(),
            text='Tour 3 quán quanh Hồ Gươm, mình dị ứng mấy thứ rang giòn',llm=llm)
        self.assertFalse(r.state.allergies)
        self.assertTrue(r.state.allergy_unresolved)
