"""Independent U5a2 safety regressions: assertions express the required behavior.

New failures deliberately remain visible; this evaluator cannot change production code.
"""
import unittest

from .test_u1_guided import engine
from app.chat.state import ChatState, ShortItem
from app.planner.types import Preferences
from app.chat.llm_understand import Outcome, sanitize


class ConfirmationRegressions(unittest.TestCase):
    def setUp(self):
        self.eng, self.venues = engine()

    def ready(self):
        st = ChatState()
        st.set_field('area', dict(kind='district', label='Hoàn Kiếm', lat=21.0285, lon=105.8522, district='Hoàn Kiếm'))
        st.set_field('duration_min', 180)
        st.set_field('vehicle', 'walk')
        st.shortlist = [ShortItem(self.venues[0].id)]
        return st

    def test_named_absence_preserves_unrelated_allergy(self):
        for text in ['Tôi không bị dị ứng tôm', 'Tôi chưa từng dị ứng tôm']:
            with self.subTest(text=text):
                r = self.eng.handle(self.ready(), Preferences(), text='Tôi dị ứng lạc')
                st = ChatState.from_json(r.state.to_json(private=True))
                r = self.eng.handle(st, r.prefs, text=text)
                self.assertEqual([a.term for a in r.state.allergies], ['lạc'])
                self.assertNotIn('allergy_cleared', [b.get('code') for b in r.blocks])

    def test_additional_unnamed_substance_blocks_planning(self):
        r = self.eng.handle(self.ready(), Preferences(), text='Tôi dị ứng tôm và một chất khác')
        self.assertTrue(r.state.allergy_unresolved)
        for action in ['request_plan', 'confirm_yes']:
            r = self.eng.handle(r.state, r.prefs, action={'type': action})
            self.assertIsNone(r.plan_request)

    def test_explicit_dislike_is_not_a_claimed_allergy(self):
        r = self.eng.handle(ChatState(), Preferences(), text='Tôi ghét trứng')
        self.assertFalse(r.state.allergies)

    def test_absent_relative_is_not_a_tour_allergy(self):
        r = self.eng.handle(ChatState(), Preferences(), text='Bạn tôi dị ứng tôm nhưng không đi cùng')
        self.assertFalse(r.state.allergies)

    def test_hypothetical_advice_is_not_an_allergy_declaration(self):
        r = self.eng.handle(ChatState(), Preferences(), text='Nếu tôi dị ứng trứng thì phải tránh gì?')
        self.assertFalse(r.state.allergies)

    def test_real_clause_survives_adjacent_hypothetical(self):
        r = self.eng.handle(self.ready(), Preferences(), text='Giả sử bạn dị ứng trứng, còn tôi dị ứng lạc thật')
        self.assertTrue(r.state.allergies or r.state.allergy_unresolved)

    def test_quote_of_food_is_fail_closed(self):
        r = self.eng.handle(self.ready(), Preferences(), text='Tôi dị ứng "tôm"')
        self.assertTrue(r.state.allergies or r.state.allergy_unresolved)

    def test_non_allergen_food_aversion_is_not_allergy(self):
        for text in ['Tôi không ăn được phở', 'Tôi không ăn được thịt bò', 'Tôi không thích sữa']:
            with self.subTest(text=text):
                self.assertFalse(self.eng.handle(ChatState(), Preferences(), text=text).state.allergies)

    def test_model_cannot_add_end_time_without_end_time_statement(self):
        text = 'Tour 3 quán quanh Hồ Gươm tối nay, mình dị ứng mấy thứ rang giòn'
        llm = lambda *a: Outcome(sanitize({'intent': 'UPDATE_PROFILE', 'patch': {'end_time': '21:00'}}), 1)
        r = self.eng.handle(ChatState(), Preferences(), text=text, llm=llm)
        self.assertEqual(r.llm_calls, 1)
        self.assertFalse(r.state.profile['end_time'].known())

    def test_start_clock_does_not_ground_invented_end_clock(self):
        text = 'Tour 3 quán quanh Hồ Gươm lúc 19h, mình dị ứng mấy thứ rang giòn'
        llm = lambda *a: Outcome(sanitize({'intent': 'UPDATE_PROFILE', 'patch': {'end_time': '21:00'}}), 1)
        r = self.eng.handle(ChatState(), Preferences(), text=text, llm=llm)
        self.assertEqual(r.llm_calls, 1)
        self.assertFalse(r.state.profile['end_time'].known())

    def test_total_duration_does_not_ground_budget_scope(self):
        text = 'Tour 3 quán quanh Hồ Gươm tổng 120 phút ngân sách 500k cho 2 người, mình dị ứng mấy thứ rang giòn'
        llm = lambda *a: Outcome(sanitize({'intent': 'UPDATE_PROFILE', 'patch': {'budget_scope': 'group'}}), 1)
        r = self.eng.handle(ChatState(), Preferences(), text=text, llm=llm)
        self.assertEqual(r.llm_calls, 1)
        self.assertIsNone(r.state.profile['budget'].scope)

    def test_conflicts_and_asked_reload_bounds(self):
        st = ChatState()
        st.conflicts = [{'key': str(i), 'values': [1, 2]} for i in range(8)]
        st.asked = [{'pending_id': str(i)} for i in range(60)]
        loaded = ChatState.from_json(st.to_json(private=True))
        self.assertEqual(len(loaded.conflicts), 8)
        self.assertEqual(len(loaded.asked), 20)
